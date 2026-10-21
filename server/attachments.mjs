import express from 'express';
import { randomUUID } from 'node:crypto';
const MAX_FILE=8*1024*1024;
export function installAttachments({ app, db, requireAuth, getChannel, HttpError, enforceRate, clock }) {
  db.exec(`CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id),filename TEXT NOT NULL,body BLOB NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS attachments_user ON attachments(user_id);`);
  app.post('/api/channels/:id/attachments',requireAuth,(req,res,next) => {
    try { getChannel(req.params.id,req.auth.user.id);enforceRate(`upload:${req.auth.user.id}`,10,60_000);next(); } catch(e){next(e);}
  },express.raw({type:'application/octet-stream',limit:MAX_FILE}),(req,res) => {
    if (!Buffer.isBuffer(req.body)||!req.body.length) throw new HttpError(400,'Выберите непустой файл до 8 МБ.');
    let filename;try{filename=decodeURIComponent(req.headers['x-file-name']||'file');}catch{throw new HttpError(400,'Некорректное имя файла.');}
    filename=filename.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,160)||'file';
    const own=Number(db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM attachments WHERE user_id=?').get(req.auth.user.id).total);
    const total=Number(db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM attachments').get().total);
    if(own+req.body.length>100*1024*1024||total+req.body.length>1024*1024*1024)throw new HttpError(413,'Достигнут лимит хранилища вложений.');
    const id=randomUUID();db.prepare('INSERT INTO attachments VALUES (?,?,?,?,?,?,?)').run(id,req.params.id,req.auth.user.id,filename,req.body,req.body.length,clock());
    res.status(201).json({filename,url:`/api/channels/${encodeURIComponent(req.params.id)}/attachments/${id}`});
  });
  app.get('/api/channels/:id/attachments/:fileId',requireAuth,(req,res) => {
    getChannel(req.params.id,req.auth.user.id);
    const row=db.prepare('SELECT * FROM attachments WHERE id=? AND channel_id=?').get(req.params.fileId,req.params.id);
    if(!row)throw new HttpError(404,'Файл не найден.');
    res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Cache-Control','private, no-store');
    res.send(Buffer.from(row.body));
  });
}
