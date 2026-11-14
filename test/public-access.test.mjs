import test from 'node:test';
import assert from 'node:assert/strict';
import {workshopServer} from '../server.mjs';
import {facilitatorAuth} from '../lib/facilitator-auth.mjs';
import {publicCache} from '../lib/public-view.mjs';
const key='e'.repeat(64);
const dataset={sources:[{id:'source-1',pageId:'page-1',name:'Writer',text:'quiet moon',url:'https://example.org',docId:'private'}],poems:[{id:'poem-1',name:'Writer',sourceIds:['source-1'],authorId:'private',lines:[[{text:'moon',sourceId:'source-1',start:6,borrowed:true,ownerId:'private'}],[],[],[]]}],_sessions:{private:'secret'},blocks:['unused']};
const snapshot={version:1,width:900,height:600,nodes:[{type:'text',text:'quiet moon',x:12,y:20}]};
async function setup(t,options={}){
 const calls=[];let revision=2;
 const server=workshopServer({facilitatorKey:key,externalOrigin:null,fetcher:async(url,init)=>{
   calls.push({url,init});assert.equal(init.headers.Authorization,'Bearer '+key);assert.equal(init.headers.Cookie,undefined);
   if(url.endsWith('/delete')){revision++;return Response.json({deleted:'821821'});}
   if(url.endsWith('/pages/source-1'))return Response.json(snapshot);
   return Response.json({code:'821821',revision,expiresAt:0,data:dataset});
 },...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return {base:'http://127.0.0.1:'+server.address().port,calls};
}
async function login(base,password=key){return fetch(base+'/api/facilitator/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});}

test('anonymous view preserves poems, source offsets and page snapshots while stripping private fields',async t=>{
 const {base,calls}=await setup(t);
 const r=await fetch(base+'/api/public/rooms/821821/view');assert.equal(r.status,200);
 const result=await r.json();assert.equal(result.revision,2);assert.equal(result.poems[0].lines[0][0].start,6);assert.equal(result.poems[0].lines[0][0].borrowed,true);
 const serialized=JSON.stringify(result);for(const value of ['private','_sessions','blocks',key])assert.ok(!serialized.includes(value));
 assert.equal(result.sources[0].text,'quiet moon');
 const page=await fetch(base+'/api/public/rooms/821821/view/pages/source-1');assert.deepEqual(await page.json(),snapshot);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.init.method||c.init.method==='GET'));
 assert.equal((await fetch(base+'/api/public/rooms/821821/view/pages/not-in-room')).status,404);
 assert.equal(calls.length,2);
});
test('the public surface cannot proxy management, exports, writes, or arbitrary upstream paths',async t=>{
 const {base,calls}=await setup(t);
 for(const path of ['/api/public/rooms','/api/public/rooms/821821/delete','/api/public/rooms/821821/export','/api/public/rooms/821821/revision/pages/source-1','/api/public/facilitator/rooms','/api/public/rooms/821821/view/pages/source-1/extra'])assert.equal((await fetch(base+path)).status,404,path);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await fetch(base+'/api/public/rooms/821821/view',{method})).status,405);
 assert.equal(calls.length,0);
});
test('existing password works from independent browsers and is replaced by a scoped signed cookie',async t=>{
 const {base,calls}=await setup(t);
 for(let browser=0;browser<2;browser++){
   const loginResponse=await login(base);assert.equal(loginResponse.status,200);
   const setCookie=loginResponse.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);assert.match(setCookie,/Path=\/api\/facilitator/);assert.ok(!setCookie.includes(key));
   assert.deepEqual(await loginResponse.json(),{authenticated:true});
   const cookie=setCookie.split(';')[0];
   const session=await fetch(base+'/api/facilitator/session',{headers:{Cookie:cookie}});assert.equal((await session.json()).authenticated,true);
   assert.equal((await fetch(base+'/api/facilitator/rooms',{headers:{Cookie:cookie}})).status,200);
   assert.equal((await fetch(base+'/api/facilitator/rooms',{headers:{Cookie:cookie+'tampered'}})).status,401);
 }
 assert.equal(calls.length,2);
 assert.equal((await fetch(base+'/api/facilitator/rooms')).status,401);
 assert.equal((await fetch(base+'/api/facilitator/rooms',{headers:{Authorization:'Bearer participant-token'}})).status,401);
 assert.equal((await login(base,'821821')).status,401);
});
test('login and cookie-authenticated writes reject cross-origin and originless requests',async t=>{
 const {base,calls}=await setup(t);
 const r=await login(base),cookie=r.headers.get('set-cookie').split(';')[0];
 for(const origin of [undefined,'https://attacker.example']){
   const headers={Cookie:cookie,'Content-Type':'application/json',...(origin?{Origin:origin}:{})};
   assert.equal((await fetch(base+'/api/facilitator/rooms/821821/delete',{method:'POST',headers,body:'{}'})).status,403);
   assert.equal((await fetch(base+'/api/facilitator/login',{method:'POST',headers,body:JSON.stringify({password:key})})).status,403);
 }
 assert.equal(calls.length,0);
});
test('management mutations invalidate public caches and preserve participant proxy auth',async t=>{
 const {base,calls}=await setup(t);
 for(let i=0;i<3;i++)assert.equal((await fetch(base+'/api/public/rooms/821821/view')).status,200);
 assert.equal(calls.length,1);
 const r=await login(base),cookie=r.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/facilitator/rooms/821821/delete',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,200);
 const next=await fetch(base+'/api/public/rooms/821821/view');assert.equal((await next.json()).revision,3);assert.equal(calls.length,3);
 const legacy=await fetch(base+'/api/facilitator/rooms',{headers:{Authorization:'Bearer '+key}});assert.equal(legacy.status,200);
});
test('password attempts are bounded and recover after the short cooldown',async t=>{
 let now=1794690000000;const {base}=await setup(t,{now:()=>now});
 for(let i=0;i<10;i++)assert.equal((await login(base,'wrong')).status,401);
 assert.equal((await login(base)).status,429);
 now+=61000;assert.equal((await login(base)).status,200);
});
test('a missing server key fails closed and public errors do not reveal upstream details',async t=>{
 const first=await setup(t,{facilitatorKey:undefined});
 assert.equal((await fetch(first.base+'/api/public/rooms/821821/view')).status,503);
 assert.equal((await login(first.base)).status,503);assert.equal(first.calls.length,0);
 const second=await setup(t,{fetcher:async()=>Response.json({error:'secret backend details'},{status:403})});
 const r=await fetch(second.base+'/api/public/rooms/821821/view');assert.equal(r.status,503);assert.ok(!(await r.text()).includes('secret'));
});
test('sessions survive a process restart with the same key, expire, and fail after key rotation',()=>{
 let now=1794690000000;const first=facilitatorAuth(key,{now:()=>now});
 const cookie=first.cookie(true);assert.match(cookie,/Secure/);const req={headers:{cookie:cookie.split(';')[0]}};
 assert.equal(facilitatorAuth(key,{now:()=>now}).session(req),true);
 assert.equal(facilitatorAuth('a'.repeat(64),{now:()=>now}).session(req),false);
 now+=12*60*60*1000;assert.equal(first.session(req),false);
 assert.match(first.cookie(true,true),/poetry_facilitator=;.*Max-Age=0/);
});
test('cache coalesces reads, expires entries, and does not refill an invalidated cache from an old read',async()=>{
 let now=0,calls=0,resolve;const cache=publicCache({now:()=>now,maxBytes:20,maxEntries:2});
 const load=async()=>{calls++;return {value:1};};
 await Promise.all([cache.get('a',load),cache.get('a',load)]);assert.equal(calls,1);
 now=15001;await cache.get('a',load);assert.equal(calls,2);
 const pending=cache.get('b',()=>new Promise(r=>{resolve=r;}));cache.clear();resolve({old:true});await pending;
 assert.equal(JSON.parse(await cache.get('b',async()=>({fresh:true}))).fresh,true);
});
