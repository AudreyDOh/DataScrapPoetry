import test from 'node:test';
import assert from 'node:assert/strict';
import {loadManagedView} from '../public/client/space/managed-access.js';

test('a fresh browser can enter a key without opening the facilitator page',async()=>{
  const events=[],data={sources:[]};
  const result=await loadManagedView('821821',{
    key:'',requestKey:async()=>{events.push('prompt');return 'a'.repeat(64);},
    fetchView:async(path,auth)=>{assert.equal(path,'/api/facilitator/rooms/821821/view');assert.equal(auth.Authorization,'Bearer '+'a'.repeat(64));events.push('authorized');return data;},
    saveKey:key=>{assert.equal(key,'a'.repeat(64));events.push('saved');}
  });
  assert.equal(result.data,data);assert.deepEqual(events,['prompt','authorized','saved']);
});
test('an invalid saved key prompts for a replacement and saves only the accepted key',async()=>{
  const saved=[];let requests=0;
  await loadManagedView('821821',{
    key:'invalid',requestKey:async message=>{assert.match(message,/not accepted/);return 'b'.repeat(64);},
    fetchView:async()=>{if(++requests===1)throw Object.assign(new Error('Forbidden'),{status:403});return {};},
    saveKey:key=>saved.push(key)
  });
  assert.equal(requests,2);assert.deepEqual(saved,['b'.repeat(64)]);
});
test('a private-link key opens directly and server failures are not treated as login failures',async()=>{
  const error=Object.assign(new Error('Room missing'),{status:404});
  await assert.rejects(loadManagedView('821821',{
    key:'c'.repeat(64),requestKey:()=>assert.fail('must not prompt'),
    fetchView:async()=>{throw error;},saveKey:()=>assert.fail('must not save')
  }),error);
});
test('a private-link key still works when the browser blocks persistent storage',async()=>{
  const original={location:globalThis.location,history:globalThis.history,localStorage:globalThis.localStorage};
  let hidden=false;
  try{
    globalThis.location={hash:'#key='+'d'.repeat(64),pathname:'/space',search:'?managed=821821'};
    globalThis.history={replaceState(_state,_title,url){assert.equal(url,'/space?managed=821821');hidden=true;globalThis.location.hash='';}};
    globalThis.localStorage={setItem(){throw new Error('blocked');},getItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
    const access=await import('../public/client/facilitator-access.js?blocked-storage');
    assert.equal(access.readAccess(),'d'.repeat(64));assert.equal(hidden,true);
    assert.equal(access.readAccess(),'d'.repeat(64));access.forgetAccess();assert.equal(access.readAccess(),'');
  }finally{for(const [name,value] of Object.entries(original)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});
