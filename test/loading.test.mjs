import test from 'node:test';
import assert from 'node:assert/strict';
import {loadInOrder,inBatches} from '../public/client/space/loading.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('fetches overlap, stay bounded and paint each page in original order before the whole room is ready',async()=>{
  const pages=Array.from({length:8},(_,i)=>({id:i,text:`page ${i}`}));
  const pending=pages.map(deferred),drawn=[],started=[];let active=0,peak=0;
  const task=loadInOrder(pages,{
    load:async(page,i)=>{started.push(i);peak=Math.max(peak,++active);try{return await pending[i].promise;}finally{active--;}},
    consume:async(value,page)=>{assert.equal(value,page);drawn.push(page.id);}
  });
  await turn();assert.deepEqual(started,[0,1,2]);
  pending[2].resolve(pages[2]);pending[1].resolve(pages[1]);await turn();
  assert.deepEqual(drawn,[]);
  pending[0].resolve(pages[0]);await turn();
  assert.deepEqual(drawn,[0,1,2]);assert.ok(started.length<pages.length);
  for(let i=3;i<pages.length;i++)pending[i].resolve(pages[i]);
  await task;assert.deepEqual(drawn,pages.map(p=>p.id));assert.equal(peak,3);
});

test('a prefetched failure is observed without skipping or reordering the failed page',async()=>{
  const first=deferred(),drawn=[],error=new Error('Page unavailable');
  const task=loadInOrder([0,1,2],{
    load:i=>i===0?first.promise:i===1?Promise.reject(error):Promise.resolve(i),
    consume:value=>drawn.push(value)
  });
  const failed=assert.rejects(task,err=>err===error);
  await turn();first.resolve(0);await failed;assert.deepEqual(drawn,[0]);
});

test('large page work yields between batches without dropping words or changing order',async()=>{
  const words=Array.from({length:2800},(_,i)=>i),seen=[],pauses=[];
  await inBatches(words,word=>seen.push(word),{pause:async()=>pauses.push(seen.length)});
  assert.deepEqual(seen,words);assert.equal(pauses.length,18);
  assert.ok(pauses.every((count,i)=>count===(i+1)*150));
});
