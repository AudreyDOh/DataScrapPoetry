import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

const base='https://datascrappoetry.onrender.com';
const upstream='https://data-scrap-poetry.super-giant-1444.chatgpt.site';
const timings=[], checks=[];
const report={environment:process.env.GITHUB_ACTIONS?'GitHub-hosted Linux runner':'local Mac',startedAt:new Date().toISOString(),checks};
const hash=text=>createHash('sha256').update(text).digest('hex');
const applicationContent=text=>text.replace(/<script>[\s\S]*?<\/script>/g,script=>script.includes('/cdn-cgi/challenge-platform/')&&script.includes('__CF$cv$params')?'':script);
const mark=(name,details={})=>{checks.push({name,status:'pass',...details});console.log(JSON.stringify(checks.at(-1)));};
async function call(path,body,token,expected=200){
  const start=performance.now();
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  const text=await response.text();
  timings.push({ms:Math.round(performance.now()-start),status:response.status,kind:body?'write':'read'});
  assert.equal(response.status,expected,`${path}: ${response.status} ${text.slice(0,160)}`);
  return JSON.parse(text);
}
try{
  assert.equal((await call('/healthz')).ok,true);mark('public health endpoint');
  for(const path of ['/workshop','/space','/client/app.js','/client/html-lab.js','/client/space/main.js']){
    const [a,b]=await Promise.all([fetch(base+path),fetch(upstream+path)]);
    assert.equal(a.status,200);assert.equal(b.status,200);
    assert.equal(hash(applicationContent(await a.text())),hash(applicationContent(await b.text())),`Different application content at ${path}`);
  }
  mark('HTML and key client modules match the original site');
  if(process.env.PROBE_ROOM){
    const code=process.env.PROBE_ROOM,token=randomBytes(32).toString('hex');
    await call(`/api/rooms/${code}/join`,{name:'Remote QA '+randomBytes(2).toString('hex'),token});
    const imported=await call(`/api/rooms/${code}/actions`,{action:'import',method:'html',text:'distant moon river returns',requestId:randomUUID()},token);
    const word=imported.room.blocks.find(b=>b.ownerId===imported.participantId&&b.text==='distant');
    await call(`/api/rooms/${code}/actions`,{action:'throw',blockId:word.id,requestId:randomUUID()},token);
    mark('remote participant joins shared browser test room and shares a word');
  }
  const created=await call('/api/rooms',{name:'QA 01'},null,201),code=created.code;
  const sessions=[{token:created.token,id:created.participantId}];
  for(let i=2;i<=20;i++){
    const token=randomBytes(32).toString('hex');
    const joined=await call(`/api/rooms/${code}/join`,{name:'QA '+String(i).padStart(2,'0'),token});
    sessions.push({token,id:joined.participantId});
  }
  const action=(s,input,expected=200)=>call(`/api/rooms/${code}/actions`,{...input,requestId:randomUUID()},s.token,expected);
  mark('20 independent participant sessions');
  await call(`/api/rooms/${code}`,undefined,undefined,401);
  await call(`/api/rooms/${code}/join`,{name:'QA 21',token:randomBytes(32).toString('hex')},null,409);
  mark('private room requires a participant token; participant 21 is refused');
  const wordsPerPerson=180;
  const text=Array.from({length:wordsPerPerson},(_,i)=>['moon','river','gentle','wait','and','the','home','return','soft','remember'][i%10]).join(' ');
  for(const s of sessions) await action(s,{action:'import',method:'html',text});
  const room=await call(`/api/rooms/${code}`,null,sessions[0].token);
  assert.equal(room.room.blocks.length,20*wordsPerPerson);
  mark('20 imports', {wordsPerPerson,totalWordOccurrences:room.room.blocks.length,responseBytes:Buffer.byteLength(JSON.stringify(room))});
  const offered=await action(sessions[0],{action:'throw',blockId:room.room.blocks.find(b=>b.ownerId===sessions[0].id).id});
  const offerId=offered.room.offers[0].id;
  const simultaneous=await Promise.allSettled(sessions.map((s,i)=>action(s,i===0?{action:'append',blockId:offered.room.offers[0].blockId,line:0}:{action:'use',offerId,line:0})));
  const failures=simultaneous.filter(r=>r.status==='rejected').map(r=>r.reason.message);
  assert.equal(failures.length,0,failures.join('\n'));
  mark('20 simultaneous poem edits');
  await action(sessions[1],{action:'use',offerId,line:0});
  const after=await call(`/api/rooms/${code}`,null,sessions[1].token);
  const own=after.room.poems.find(p=>p.authorId===sessions[1].id);
  assert.equal(own.lines[0].length,2);
  await action(sessions[1],{action:'move',from:0,to:1,index:1,toIndex:0,blockId:own.lines[0][1]});
  await action(sessions[1],{action:'use',offerId,line:0});
  const beforeSplit=await call(`/api/rooms/${code}`,null,sessions[1].token);
  const line=beforeSplit.room.poems.find(p=>p.authorId===sessions[1].id).lines[0];
  await action(sessions[1],{action:'split',line:0,index:0,blockId:line[0]});
  mark('shared word reuse, moving between lines, splitting a line');
  for(let round=0;round<3;round++){
    const results=await Promise.all(sessions.map(s=>call(`/api/rooms/${code}`,null,s.token)));
    assert.equal(new Set(results.map(r=>r.revision)).size,1);
    assert.ok(results.every(r=>r.room.poems.length===20));
  }
  mark('60 authenticated reads in three 20-client bursts');
  await action(sessions[1],{action:'publish'},403);
  const published=await action(sessions[0],{action:'publish'});
  const gallery=await call('/api/galleries/'+published.room.galleryId);
  assert.equal(gallery.poems.length,20);
  assert.ok(!('token' in gallery)&&!('_sessions' in gallery));
  const exported=await call(`/api/rooms/${code}/export`,null,sessions[0].token);
  assert.equal(exported.graph.nodes.length,20);
  mark('owner publishes; anonymous gallery and authenticated export work');
  // A separate disposable room probes the actual storage boundary without
  // changing a workshop room or a participant's existing work.
  if(process.env.CHECK_CAPACITY==='1'){
    const capacity=await call('/api/rooms',{name:'Capacity QA'},null,201);
    let last=capacity,acceptedWords=0,rejection=null;
    for(let i=0;i<20;i++){
      let token=capacity.token;
      if(i){token=randomBytes(32).toString('hex');await call(`/api/rooms/${capacity.code}/join`,{name:'Capacity '+i,token});}
      const response=await fetch(base+`/api/rooms/${capacity.code}/actions`,{method:'POST',headers:{Origin:base,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'import',method:'html',text:Array.from({length:500},()=> 'memory').join(' '),requestId:randomUUID()}),signal:AbortSignal.timeout(25000)});
      const body=await response.json();
      if(!response.ok){rejection={status:response.status,message:body.error,completedParticipants:i,wordsPerPerson:500};break;}
      acceptedWords+=500;last=body;
    }
    const retained=await call(`/api/rooms/${capacity.code}`,null,capacity.token);
    assert.equal(retained.room.blocks.length,acceptedWords);
    report.capacity={rejection,acceptedWords,previousDataRetained:true};
    console.log(JSON.stringify({capacity:report.capacity}));
  }
  report.status='passed';
}catch(error){report.status='failed';report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  const values=timings.map(t=>t.ms).sort((a,b)=>a-b);
  report.requests=timings.length;report.latencyMs={median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],max:values.at(-1)};
  report.finishedAt=new Date().toISOString();
  await writeFile(process.env.REPORT_PATH||'readiness-result.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,requests:report.requests,latencyMs:report.latencyMs}));
}
