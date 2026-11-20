import {validatePage} from '../../public/client/page-model.js';
import {galleryData} from '../../public/client/space-data.js';
import { moveWord, splitLine } from '../../public/client/poem-edit.js';
import { createRoom, joinRoom, addSource, applyCollection, throwBlock, claimBlock, savePoem } from '../../public/client/room.js';
import { classifySource } from '../../public/client/grammar.js';
export class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new ApiError(status,message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function tokenHash(token){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function randomToken(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function nameCheck(name){if(typeof name!=='string'||!name.trim()||name.trim().length>40)fail(400,'Enter a name of 1–40 characters.');return name.trim();}
function codeCheck(code){if(typeof code!=='string'||!/^[A-Z0-9]{6,10}$/.test(code))fail(400,'Use 6–10 letters or numbers for the room code.');}
export const MAX_PARTICIPANTS=10, MAX_TEXT=100000;
function owner(state,id){if(state.participants[0]?.id!==id)fail(403,'Only the room creator can do this.');}
function publicRoom(state,id){
  const offered=new Set(state.offers.map(o=>o.blockId));
  const blocks=state.blocks.filter(b=>b.ownerId===id||offered.has(b.id));
  const usedSources=new Set(blocks.map(b=>b.sourceId));
  return {version:2,capacity:MAX_PARTICIPANTS,participants:state.participants,
    sources:state.sources.filter(s=>usedSources.has(s.id)).map(({id,ownerId,title,url,method})=>({id,ownerId,title,url,method})),
    blocks,offers:state.offers,poems:state.poems.filter(p=>p.authorId===id),closing:Boolean(state._closing)};
}
function compact(state){
  const keep=new Set(state.poems.flatMap(p=>p.lines.flat()));
  for(const offer of state.offers){keep.add(offer.blockId);if(offer.receivedBlockId)keep.add(offer.receivedBlockId);}
  const storedSources=new Set(state.sources.filter(s=>s.docId).map(s=>s.id));
  return {...state,blocks:state.blocks.filter(b=>!storedSources.has(b.sourceId)||keep.has(b.id)||b.receivedOfferId),
    sources:state.sources.map(s=>{if(!s.docId)return s;const {text,...meta}=s;return meta;})};
}
function roomCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return [...crypto.getRandomValues(new Uint8Array(10))].map(x=>alphabet[x%32]).join('');}
export class WorkshopService {
  constructor(repository){this.repo=repository;}
  async create(name,requestedCode=''){
    name=nameCheck(name);if(typeof requestedCode!=='string')fail(400,'Use 6–10 letters or numbers for the room code.');
    requestedCode=requestedCode.trim().toUpperCase();if(requestedCode)codeCheck(requestedCode);
    const token=randomToken(),hash=await tokenHash(token);
    for(let attempt=0;attempt<3;attempt++){
      const code=requestedCode||roomCode();
      const state=createRoom(),person=joinRoom(state,name);
      state._sessions={[hash]:person.id};state._applied=[];state._collections={};
      const row={code,state,revision:0,expiresAt:Date.now()+7*24*60*60*1000};
      if(await this.repo.create(row))return {code,token,participantId:person.id,revision:0,isHost:true,room:publicRoom(state,person.id)};
      if(requestedCode)fail(409,'That room code is already in use. Use Join room.');
    }
    fail(503,'Could not create a room. Try again.');
  }
  async load(code){codeCheck(code);const row=await this.repo.read(code);if(!row||row.expiresAt<Date.now())fail(404,'Room not found or expired.');for(const poem of row.state.poems){if(poem.lines.length===3&&poem.lines.every(line=>line.length===0))poem.lines.push([]);}
    const punctuationIds=new Set(row.state.blocks.filter(block=>block.category==='punctuation').map(block=>block.id));
    if(punctuationIds.size){
      row.state.blocks=row.state.blocks.filter(block=>!punctuationIds.has(block.id));
      row.state.offers=row.state.offers.filter(offer=>!punctuationIds.has(offer.blockId)&&!punctuationIds.has(offer.receivedBlockId));
      for(const poem of row.state.poems)poem.lines=poem.lines.map(line=>line.filter(id=>!punctuationIds.has(id)));
    }
    return row;}
  async session(code,token){const row=await this.load(code);const hash=await tokenHash(token||'');const id=row.state._sessions[hash];if(!id)fail(401,'Rejoin this room.');return {row,id,hash};}
  async hydrate(state,id){
    const sourceId=state._collections?.[id];if(!sourceId)return state;
    const source=state.sources.find(s=>s.id===sourceId);if(!source?.docId)return state;
    const collection=await this.repo.getAsset(source.docId);if(!collection)fail(500,'Collection unavailable.');
    const existing=new Set(state.blocks.map(b=>b.id));
    state.blocks.push(...collection.blocks.filter(b=>!existing.has(b.id)));
    return state;
  }
  response(code,state,id,revision){return {code,participantId:id,isHost:state.participants[0]?.id===id,collectionId:state._collections?.[id]||null,revision,room:publicRoom(state,id)};}
  async get(code,token,since=null,collectionId=null){
    const {row,id}=await this.session(code,token);
    if(since!==null&&Number(since)===row.revision)return {code,participantId:id,revision:row.revision,unchanged:true};
    const unchanged=Boolean(collectionId&&collectionId===row.state._collections?.[id]);
    if(!unchanged)await this.hydrate(row.state,id);
    return {...this.response(code,row.state,id,row.revision),collectionUnchanged:unchanged};
  }
  async join(code,name,token){
    name=nameCheck(name);if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(400,'Invalid session.');
    const hash=await tokenHash(token);
    return this.change(code,null,(state)=>{
      if(state._sessions[hash])return state._sessions[hash];
      if(state._closing)fail(409,'This workshop has ended. Wait for the new room link.');
      if(state.participants.length>=MAX_PARTICIPANTS)fail(409,'This room is full (10 participants).');
      if(state.participants.some(p=>p.name.toLowerCase()===name.toLowerCase()))fail(409,'That name is already in use.');
      const person=joinRoom(state,name);state._sessions[hash]=person.id;return person.id;
    });
  }
  async change(code,hash,fn,{hydrate=true}={}){
    for(let attempt=0;attempt<25;attempt++){
      const row=await this.load(code),state=row.state;
      if(hash&&!state._sessions[hash])fail(401,'Rejoin this room.');
      const id=hash?state._sessions[hash]:null;
      if(id&&hydrate)await this.hydrate(state,id);
      const participantId=fn(state,id);
      const persisted=compact(state);
      if(new TextEncoder().encode(JSON.stringify(persisted)).length>1400000)fail(413,'Room storage is full. Export and start a new room.');
      if(await this.repo.compareAndSwap(code,row.revision,persisted))return this.response(code,state,participantId,row.revision+1);
      await sleep(8+Math.random()*Math.min(160,15*(attempt+1)));
    }
    fail(503,'Room is busy. Please try again.');
  }
  async act(code,token,input){
    if(typeof input.requestId!=='string'||input.requestId.length<8||input.requestId.length>80)fail(400,'Missing request ID.');
    const hash=await tokenHash(token||'');let prepared=null;
    if(input.action==='import'){
      const {row,id}=await this.session(code,token);
      if(row.state._closing)fail(409,'This workshop has ended. Wait for the new room link.');
      if(row.state._applied.includes(`${id}:${input.requestId}`))return this.get(code,token);
      if(typeof input.text!=='string'||!input.text.trim()||input.text.length>MAX_TEXT)fail(400,'Use 1–100,000 characters per import.');
      let sourceUrl=null;
      if(input.url){try{if(typeof input.url!=='string'||input.url.length>2048)throw new Error();const parsed=new URL(input.url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error();sourceUrl=parsed.href;}catch{fail(400,'Enter a public http or https webpage link.');}}
      const page=input.page?validatePage(input.page):null,pageId=page?crypto.randomUUID():null;
      const temporary={participants:row.state.participants,sources:[],blocks:[]};
      prepared=addSource(temporary,id,{url:sourceUrl,title:input.method==='html'?'Pasted HTML':'Pasted text',method:input.method==='html'?'html':'paste',text:input.text,pageId});
      const seen=new Set();prepared.blocks=prepared.blocks.filter(b=>{const key=b.text.toLowerCase().replace('’',"'");if(b.category==='punctuation'||seen.has(key))return false;seen.add(key);return true;});
      classifySource(prepared.source,prepared.blocks);
      for(const block of prepared.blocks)delete block.grammarTags;
      prepared.source.docId=prepared.source.id;
      if(page)await this.repo.putPage(pageId,page,code);
      await this.repo.putAsset(prepared.source.docId,code,prepared);
    }
    const result=await this.change(code,hash,(room,id)=>{
      const requestKey=`${id}:${input.requestId}`;
      if(room._applied.includes(requestKey))return id;
      if(room._closing&&!['resume','prepare-reset'].includes(input.action))fail(409,'This workshop has ended. Wait for the new room link.');
      const poem=room.poems.find(p=>p.authorId===id);
      const lines=poem.lines.map(l=>[...l]);
      const index=(value,max)=>Number.isInteger(value)&&value>=0&&value<max;
      switch(input.action){
        case 'import': {
          applyCollection(room,id,structuredClone(prepared));
          room._collections ||= {};room._collections[id]=prepared.source.id;break;
        }
        case 'prepare-reset': owner(room,id);room._closing=true;break;
        case 'resume': owner(room,id);delete room._closing;break;
        case 'publish': fail(403,'Use the host visualization or download an archive.');break;
        case 'throw': {
          const block=room.blocks.find(b=>b.id===input.blockId&&b.ownerId===id&&!b.archivedFromCollection);
          if(!block)fail(403,'That word is not in your collection.');
          if(room.offers.length>=1000)fail(413,'Shared word limit reached.');
          throwBlock(room,id,block.id);break;
        }
        case 'claim': claimBlock(room,id,input.offerId);break;
        case 'use': {
          if(!index(input.line,lines.length))fail(400,'Invalid line.');
          if(lines.flat().length>=120)fail(400,'Use at most 120 blocks per poem.');
          const block=claimBlock(room,id,input.offerId);
          if(input.toIndex!==undefined&&(!Number.isInteger(input.toIndex)||input.toIndex<0||input.toIndex>lines[input.line].length))fail(400,'Invalid word position.');
          lines[input.line].splice(input.toIndex??lines[input.line].length,0,block.id);savePoem(room,id,lines);break;
        }
        case 'append':
          if(!index(input.line,lines.length))fail(400,'Invalid line.');
          if(!room.blocks.some(b=>b.id===input.blockId&&b.ownerId===id&&!b.archivedFromCollection))fail(403,'That word is not in your collection.');
          if(lines.flat().length>=120)fail(400,'Use at most 120 blocks per poem.');
          if(input.toIndex!==undefined&&(!Number.isInteger(input.toIndex)||input.toIndex<0||input.toIndex>lines[input.line].length))fail(400,'Invalid word position.');
          lines[input.line].splice(input.toIndex??lines[input.line].length,0,input.blockId);savePoem(room,id,lines);break;
        case 'remove':
          if(!index(input.line,lines.length)||!index(input.index,lines[input.line].length)||lines[input.line][input.index]!==input.blockId)fail(409,'The poem changed. Try again.');
          lines[input.line].splice(input.index,1);savePoem(room,id,lines);break;
        case 'move': savePoem(room,id,moveWord(lines,input));break;
        case 'split': savePoem(room,id,splitLine(lines,input));break;
        case 'line': if(lines.length>=6)fail(400,'Maximum six lines.');savePoem(room,id,[...lines,[]]);break;
        default: fail(400,'Unknown action.');
      }
      room._applied.push(requestKey);room._applied=room._applied.slice(-500);return id;
    },{hydrate:['import','append','throw'].includes(input.action)});
    if(input.action!=='import')return this.get(code,token,null,input.collectionId||null);
    return result;
  }
  async gallery(id,token){if(!/^[a-f0-9]{64}$/.test(id))fail(404,'View not found.');const code=await this.repo.galleryRoom(id);if(!code)fail(404,'View not found.');const session=await this.session(code,token);owner(session.row.state,session.id);const value=await this.repo.getGallery(id);if(!value)fail(404,'View not found.');return value;}
  async page(id){return await this.repo.getPage(id);}
  async visualization(code,token){
    const {row,id}=await this.session(code,token);owner(row.state,id);
    // Only poem/shared references are needed; unused collections never enter an archive.
    for(const source of row.state.sources)if(source.docId){const document=await this.repo.getAsset(source.docId);source.text=document?.source.text||'';}
    return {row,data:galleryData(row.state)};
  }
  async preview(code,token){return (await this.visualization(code,token)).data;}
  async export(code,token){
    const {row,data}=await this.visualization(code,token),pages={};
    await Promise.all(data.sources.map(async source=>{if(source.pageId)pages[source.id]=await this.repo.getPage(source.pageId);}));
    return {format:'data-scrap-poetry-visualization',version:1,createdAt:new Date().toISOString(),revision:row.revision,data,pages};
  }
  async restart(code,token,input){
    const {row,id}=await this.session(code,token);owner(row.state,id);
    if(!row.state._closing||row.revision!==input.revision)fail(409,'Download the current visualization before starting a new room.');
    codeCheck(input.code);
    if(input.code===code||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))fail(400,'Invalid new room.');
    const state=createRoom(),person=joinRoom(state,row.state.participants.find(p=>p.id===id).name);
    state._sessions={[await tokenHash(input.token)]:person.id};state._applied=[];state._collections={};
    const next={code:input.code,state,revision:0,expiresAt:Date.now()+7*24*60*60*1000};
    if(await this.repo.read(next.code))fail(409,'That room code is already in use.');
    if(!await this.repo.rotate(row,input.revision,next))fail(409,'The room changed. Download again before starting a new room.');
    return this.response(next.code,state,person.id,0);
  }
}
