import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';

test('friends require recipient consent; DMs and search enforce membership and survive restart', async () => {
  const directory=await mkdtemp(join(tmpdir(),'podpivkovichi-social-'));
  const env={ADMIN_USERNAME:'owner',ADMIN_PASSWORD:'Owner-test-5938',APP_ORIGIN:'http://chat.test'};
  let service=await createApp({env,dataDir:directory});
  async function listen(){await new Promise(r => service.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${service.server.address().port}`;}
  let base=await listen();
  async function req(path,cookie,body){const response=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  try {
    const owner=await req('/login',null,{username:'owner',password:env.ADMIN_PASSWORD});
    const alice=await req('/register',null,{username:'alice',password:'Alice-test-5938'});
    const bob=await req('/register',null,{username:'bobby',password:'Bobby-test-5938'});
    const eve=await req('/register',null,{username:'outsider',password:'Outside-test-5938'});
    assert.equal((await req('/social')).status,401);
    assert.equal((await req('/direct',alice.cookie,{userId:bob.body.user.id})).status,403);
    assert.equal((await req('/friends/request',alice.cookie,{username:'bobby'})).status,201);
    assert.equal((await req('/friends/request',bob.cookie,{username:'alice'})).status,409);
    assert.equal((await req('/friends/respond',alice.cookie,{userId:bob.body.user.id,accept:true})).status,404);
    assert.equal((await req('/friends/respond',bob.cookie,{userId:alice.body.user.id,accept:true})).status,200);
    const direct=await req('/direct',alice.cookie,{userId:bob.body.user.id});
    const id=direct.body.id;
    assert.equal((await req(`/direct/${id}/messages`,alice.cookie,{content:'Привет 🍻'})).status,201);
    assert.equal((await req(`/direct/${id}/messages`,eve.cookie)).status,404);
    assert.equal((await req(`/direct/${id}/messages`,eve.cookie,{content:'injection'})).status,404);
    assert.equal((await req(`/direct/${id}/messages?before=NaN`,bob.cookie)).status,400);
    assert.equal((await req('/social',bob.cookie)).body.conversations[0].unread,1);
    const messages=await req(`/direct/${id}/messages`,bob.cookie);
    await req(`/direct/${id}/read`,bob.cookie,{lastId:messages.body.messages[0].id});
    assert.equal((await req('/social',bob.cookie)).body.conversations[0].unread,0);
    await req('/channels/general/messages',owner.cookie,{content:'secret-search-test'});
    const file = await fetch(base+'/api/channels/general/attachments',{method:'POST',headers:{Origin:env.APP_ORIGIN,Cookie:owner.cookie,'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent('тест.txt')},body:'Private attachment'});
    assert.equal(file.status,201); const attachment=await file.json();
    const downloaded=await fetch(base+attachment.url,{headers:{Cookie:owner.cookie}});
    assert.equal(await downloaded.text(),'Private attachment');
    assert.match(downloaded.headers.get('content-disposition'),/^attachment/);
    assert.equal((await fetch(base+attachment.url,{headers:{Cookie:eve.cookie}})).status,404);
    assert.equal((await fetch(base+attachment.url)).status,401);
    assert.equal((await req('/channels/general/search?q=secret',owner.cookie)).body.messages.length,1);
    assert.equal((await req('/channels/general/search?q=secret',eve.cookie)).status,404);
    await req('/friends/remove',bob.cookie,{userId:alice.body.user.id});
    assert.equal((await req(`/direct/${id}/messages`,alice.cookie,{content:'blocked'})).status,403);
    await service.close(); service=await createApp({env,dataDir:directory});base=await listen();
    assert.equal((await req(`/direct/${id}/messages`,bob.cookie)).body.messages[0].content,'Привет 🍻');
  } finally {await service.close();assert.ok(directory.startsWith(join(tmpdir(),'podpivkovichi-social-')));await rm(directory,{recursive:true,force:true});}
});
