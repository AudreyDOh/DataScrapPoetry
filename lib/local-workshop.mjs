import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WorkshopService, ApiError} from './workshop/service.mjs';
import {FacilitatorService} from './workshop/facilitator.mjs';
import {fetchPage} from './workshop/fetch-page.mjs';
import {localRepository} from './local-repository.mjs';

const error=(status,message)=>({status,body:{error:message}});
const validCode=value=>typeof value==='string'&&/^[A-Z0-9]{6,10}$/.test(value);

function rehydrate(snapshot){
  if(!snapshot||snapshot.format!=='data-scrap-poetry-visualization'||!validCode(snapshot.roomCode)||!Array.isArray(snapshot.data?.sources)||!Array.isArray(snapshot.data?.poems))throw new ApiError(400,'Invalid visualization export.');
  const state={version:2,participants:[],sources:[],blocks:[],offers:[],poems:[],_sessions:{},_applied:[],_collections:{}};
  const participantByName=new Map();
  const person=name=>{
    const key=String(name||'Participant').trim().toLowerCase()||'participant';
    if(!participantByName.has(key)){const value={id:crypto.randomUUID(),name:String(name||'Participant').trim()||'Participant'};participantByName.set(key,value);state.participants.push(value);}
    return participantByName.get(key);
  };
  const sourceOwner=new Map();
  for(const source of snapshot.data.sources){
    if(!source||typeof source.id!=='string')continue;
    const owner=person(source.name);sourceOwner.set(source.id,owner.id);
    state.sources.push({id:source.id,ownerId:owner.id,title:'Restored source',url:source.url||null,method:'html',text:typeof source.text==='string'?source.text:'',pageId:source.pageId||null});
  }
  for(const poem of snapshot.data.poems){
    const author=person(poem.name);const record={id:typeof poem.id==='string'?poem.id:crypto.randomUUID(),authorId:author.id,lines:[]};
    for(const line of Array.isArray(poem.lines)?poem.lines:[]){
      const ids=[];
      for(const word of line){
        if(!word||typeof word.text!=='string')continue;
        const originalOwner=sourceOwner.get(word.sourceId)||author.id;
        let block={id:crypto.randomUUID(),ownerId:originalOwner,sourceId:word.sourceId||null,text:word.text,start:Number.isInteger(word.start)?word.start:0,end:Number.isInteger(word.start)?word.start+word.text.length:word.text.length,category:'unclassified',receivedOfferId:null};
        if(word.borrowed&&originalOwner!==author.id){
          state.blocks.push(block);const offer={id:crypto.randomUUID(),blockId:block.id,senderId:originalOwner,recipientId:null,receivedBlockId:null};state.offers.push(offer);
          block={...block,id:crypto.randomUUID(),ownerId:author.id,receivedOfferId:offer.id};
        } else block={...block,ownerId:author.id};
        state.blocks.push(block);ids.push(block.id);
      }
      record.lines.push(ids);
    }
    while(record.lines.length<4)record.lines.push([]);state.poems.push(record);
  }
  return {code:snapshot.roomCode,state,revision:Number.isSafeInteger(snapshot.revision)?snapshot.revision:0,expiresAt:Date.now()+7*24*60*60*1000};
}

export function localWorkshop({file,facilitatorKey}){
  const keyHash=createHash('sha256').update(facilitatorKey||'').digest('hex');
  const repo=localRepository(file),api=new WorkshopService(repo),manager=new FacilitatorService(repo,keyHash);
  async function owns(code){return validCode(code)&&Boolean(await repo.read(code));}
  async function restore(snapshot){
    const row=rehydrate(snapshot),pages=snapshot.pages&&typeof snapshot.pages==='object'?snapshot.pages:{};
    if(!await repo.restore(row,{},pages))throw new ApiError(409,'This room is already restored on Render.');
    return {code:row.code,expiresAt:row.expiresAt,poems:row.state.poems.length,sources:row.state.sources.length};
  }
  async function publicData(code){return (await manager.preview(facilitatorKey,code)).data;}
  async function publicPage(code,sourceId){return manager.page(facilitatorKey,code,sourceId);}
  async function route({method,path,query,token,input}){
    const parts=path.split('/').filter(Boolean);
    if(parts[0]==='api')parts.shift();
    try{
      if(parts[0]==='rooms'&&parts[1]&&await owns(parts[1])){
        const code=parts[1];
        if(method==='GET'&&parts.length===2)return {status:200,body:await api.get(code,token,query.get('since'),query.get('collection'))};
        if(method==='GET'&&parts[2]==='export')return {status:200,body:await api.export(code,token)};
        if(method==='GET'&&parts[2]==='view'){
          const data=await api.preview(code,token);
          if(parts.length===3)return {status:200,body:data};
          if(parts.length===5&&parts[3]==='pages'){const source=data.sources.find(s=>s.id===parts[4]);if(!source)throw new ApiError(404,'Page not found.');return {status:200,body:source.pageId?await api.page(source.pageId):null};}
        }
        if(method==='POST'&&parts[2]==='join')return {status:200,body:await api.join(code,input?.name,input?.token)};
        if(method==='POST'&&parts[2]==='actions')return {status:200,body:await api.act(code,token,input||{})};
        if(method==='POST'&&['fetch-page','fetch-style'].includes(parts[2])){await api.session(code,token);return {status:200,body:await fetchPage(input?.url,{style:parts[2]==='fetch-style'})};}
        if(method==='POST'&&parts[2]==='restart')return {status:200,body:await api.restart(code,token,input||{})};
      }
      if(parts[0]==='facilitator'&&parts[1]==='rooms'&&parts[2]&&await owns(parts[2])){
        const code=parts[2];await manager.authorize(token);
        if(method==='GET'&&parts.length===3)return {status:200,body:await manager.preview(token,code)};
        if(method==='GET'&&parts[3]==='export')return {status:200,body:await manager.export(token,code)};
        if(method==='GET'&&parts[3]==='view'){
          const data=(await manager.preview(token,code)).data;
          if(parts.length===4)return {status:200,body:data};
          if(parts.length===6&&parts[4]==='pages')return {status:200,body:await manager.page(token,code,parts[5])};
        }
      }
      return null;
    }catch(e){return error(e instanceof ApiError?e.status:400,e?.message||'Request failed.');}
  }
  return {owns,restore,route,publicData,publicPage,fileExists:()=>existsSync(file)};
}
