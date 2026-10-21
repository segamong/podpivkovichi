import { randomUUID } from 'node:crypto';

export function installSocial({ app, db, requireAuth, HttpError, clock, enforceRate, getChannel, sockets }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted')),
      created_at INTEGER NOT NULL, PRIMARY KEY(sender,recipient), CHECK(sender <> recipient)
    );
    CREATE TABLE IF NOT EXISTS direct_conversations (
      id TEXT PRIMARY KEY, first_user TEXT NOT NULL REFERENCES users(id), second_user TEXT NOT NULL REFERENCES users(id),
      UNIQUE(first_user,second_user), CHECK(first_user < second_user)
    );
    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL REFERENCES direct_conversations(id),
      user_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS direct_messages_conversation ON direct_messages(conversation_id,id);
    CREATE TABLE IF NOT EXISTS direct_reads (
      conversation_id TEXT NOT NULL REFERENCES direct_conversations(id), user_id TEXT NOT NULL REFERENCES users(id),
      last_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(conversation_id,user_id)
    );
  `);
  const areFriends = (a, b) => db.prepare("SELECT 1 FROM friendships WHERE status = 'accepted' AND ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))").get(a,b,b,a);
  const conversation = (id, user) => {
    const row = db.prepare('SELECT * FROM direct_conversations WHERE id = ? AND (first_user = ? OR second_user = ?)').get(id,user,user);
    if (!row) throw new HttpError(404,'Беседа не найдена.');
    return row;
  };
  const online = (id) => [...sockets.values()].some(client => client.user.id === id && client.expiresAt > clock());
  app.get('/api/social', requireAuth, (req,res) => {
    const id = req.auth.user.id;
    const friends = db.prepare(`SELECT f.sender, f.recipient, f.status, u.id, u.username FROM friendships f JOIN users u ON u.id = CASE WHEN f.sender = ? THEN f.recipient ELSE f.sender END WHERE f.sender = ? OR f.recipient = ? ORDER BY u.username`).all(id,id,id).map(row => ({ id: row.id, username: row.username, status: row.status, incoming: row.recipient === id, online: online(row.id) }));
    const conversations = db.prepare(`SELECT c.id, u.id AS userId, u.username,
      (SELECT content FROM direct_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS preview,
      (SELECT COUNT(*) FROM direct_messages m WHERE m.conversation_id=c.id AND m.user_id<>? AND m.id>COALESCE((SELECT last_id FROM direct_reads WHERE conversation_id=c.id AND user_id=?),0)) AS unread
      FROM direct_conversations c JOIN users u ON u.id=CASE WHEN c.first_user=? THEN c.second_user ELSE c.first_user END
      WHERE c.first_user=? OR c.second_user=? ORDER BY COALESCE((SELECT MAX(id) FROM direct_messages WHERE conversation_id=c.id),0) DESC`).all(id,id,id,id,id).map(row => ({ ...row, online: online(row.userId) }));
    res.json({ friends, conversations });
  });
  app.post('/api/friends/request', requireAuth, (req,res) => {
    enforceRate(`friend:${req.auth.user.id}`,20,60_000);
    const username = req.body?.username;
    if (typeof username !== 'string' || username.length>32) throw new HttpError(400,'Укажите никнейм.');
    const target = db.prepare('SELECT id FROM users WHERE username=?').get(username.toLowerCase().trim());
    if (!target) throw new HttpError(404,'Пользователь с таким никнеймом не найден.');
    const id = req.auth.user.id;
    if (target.id === id) throw new HttpError(400,'Это ваш аккаунт.');
    if (db.prepare('SELECT 1 FROM friendships WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)').get(id,target.id,target.id,id)) throw new HttpError(409,'Заявка уже существует или вы уже друзья.');
    db.prepare("INSERT INTO friendships VALUES (?,?,'pending',?)").run(id,target.id,clock()); res.status(201).json({ ok:true });
  });
  app.post('/api/friends/respond', requireAuth, (req,res) => {
    const { userId, accept } = req.body || {};
    if (typeof userId !== 'string' || typeof accept !== 'boolean') throw new HttpError(400,'Некорректный ответ.');
    const row = db.prepare("SELECT 1 FROM friendships WHERE sender=? AND recipient=? AND status='pending'").get(userId,req.auth.user.id);
    if (!row) throw new HttpError(404,'Заявка не найдена.');
    if (accept) db.prepare("UPDATE friendships SET status='accepted' WHERE sender=? AND recipient=?").run(userId,req.auth.user.id);
    else db.prepare('DELETE FROM friendships WHERE sender=? AND recipient=?').run(userId,req.auth.user.id);
    res.json({ ok:true });
  });
  app.post('/api/friends/remove', requireAuth, (req,res) => {
    const { userId } = req.body || {}; if (typeof userId !== 'string') throw new HttpError(400,'Укажите пользователя.');
    db.prepare('DELETE FROM friendships WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)').run(req.auth.user.id,userId,userId,req.auth.user.id);
    res.json({ ok:true });
  });
  app.post('/api/direct', requireAuth, (req,res) => {
    const peer = req.body?.userId, own = req.auth.user.id;
    if (typeof peer !== 'string' || !areFriends(own,peer)) throw new HttpError(403,'Личные сообщения доступны после принятия заявки в друзья.');
    const [first,second] = [own,peer].sort();
    db.prepare('INSERT OR IGNORE INTO direct_conversations VALUES (?,?,?)').run(randomUUID(),first,second);
    res.json({ id: db.prepare('SELECT id FROM direct_conversations WHERE first_user=? AND second_user=?').get(first,second).id });
  });
  app.get('/api/direct/:id/messages', requireAuth, (req,res) => {
    conversation(req.params.id,req.auth.user.id);
    const before = Number(req.query.before || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before<1) throw new HttpError(400,'Некорректная страница.');
    const rows = db.prepare(`SELECT m.id, m.content, m.user_id AS userId, u.username, m.created_at AS createdAt FROM direct_messages m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? AND m.id<? ORDER BY m.id DESC LIMIT 51`).all(req.params.id,before);
    res.json({ messages: rows.slice(0,50).reverse(), hasMore: rows.length>50 });
  });
  app.post('/api/direct/:id/read', requireAuth, (req,res) => {
    conversation(req.params.id,req.auth.user.id);
    const id=Number(req.body?.lastId);
    if (!Number.isSafeInteger(id)||id<0) throw new HttpError(400,'Некорректное сообщение.');
    const maximum = Number(db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM direct_messages WHERE conversation_id=?').get(req.params.id).id);
    db.prepare('INSERT INTO direct_reads VALUES (?,?,?) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').run(req.params.id,req.auth.user.id,Math.min(id,maximum));
    res.json({ ok:true });
  });
  app.post('/api/direct/:id/messages', requireAuth, (req,res) => {
    const row = conversation(req.params.id,req.auth.user.id);
    if (!areFriends(row.first_user,row.second_user)) throw new HttpError(403,'Вы больше не друзья. Новые сообщения недоступны.');
    enforceRate(`dm:${req.auth.user.id}`,30,10_000);
    const text=req.body?.content;
    if (typeof text!=='string'||!text.trim()||text.length>4000) throw new HttpError(400,'Сообщение: от 1 до 4000 символов.');
    const result=db.prepare('INSERT INTO direct_messages(conversation_id,user_id,content,created_at) VALUES (?,?,?,?)').run(row.id,req.auth.user.id,text.trim(),clock());
    res.status(201).json({ id:Number(result.lastInsertRowid) });
  });
  app.get('/api/channels/:id/search', requireAuth, (req,res) => {
    getChannel(req.params.id,req.auth.user.id);
    const q=req.query.q;
    if (typeof q!=='string'||q.trim().length<2||q.length>100) throw new HttpError(400,'Введите от 2 до 100 символов.');
    const messages=db.prepare(`SELECT m.id,m.content,m.created_at AS createdAt,u.username FROM messages m JOIN users u ON u.id=m.user_id WHERE m.channel_id=? AND m.deleted_at IS NULL AND instr(lower(m.content),lower(?))>0 ORDER BY m.id DESC LIMIT 50`).all(req.params.id,q.trim());
    res.json({ messages });
  });
}
