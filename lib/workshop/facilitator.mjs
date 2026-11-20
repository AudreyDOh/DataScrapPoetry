import {ApiError,tokenHash} from './service.mjs';
import {galleryData} from '../../public/client/space-data.js';
import {validatePage} from '../../public/client/page-model.js';
import {publicURL} from './fetch-page.mjs';

function checkRevision(row,revision){if(!Number.isSafeInteger(revision)||revision!==row.revision)throw new ApiError(409,'The room changed. Refresh the room and try again.');}

// Site-owner access is separate from participant tokens and room codes.
export async function authorizeFacilitator(token,expectedHash) {
  if(!/^[a-f0-9]{64}$/.test(expectedHash||'')||!/^[a-f0-9]{64}$/.test(token||''))throw new ApiError(403,'Facilitator access required.');
  const actual=await tokenHash(token);let different=0;
  for(let i=0;i<64;i++)different|=actual.charCodeAt(i)^expectedHash.charCodeAt(i);
  if(different)throw new ApiError(403,'Facilitator access required.');
}

export class FacilitatorService {
  constructor(repo,keyHash){this.repo=repo;this.keyHash=keyHash;}
  async authorize(token){await authorizeFacilitator(token,this.keyHash);}
  async list(token,after=''){await this.authorize(token);if(after&&!/^[A-Z0-9]{6,10}$/.test(after))throw new ApiError(400,'Invalid room cursor.');return this.repo.listRooms(after);}
  async room(token,code){
    await this.authorize(token);if(!/^[A-Z0-9]{6,10}$/.test(code||''))throw new ApiError(400,'Invalid room code.');
    // Expiration closes participant access, but retained records stay exportable.
    const row=await this.repo.read(code);if(!row)throw new ApiError(404,'Room not found. It may already have been deleted.');return row;
  }
  async preview(token,code){
    const row=await this.room(token,code);
    for(const source of row.state.sources)if(source.docId){const document=await this.repo.getAsset(source.docId);source.text=document?.source.text||'';}
    const data=galleryData(row.state);
    return {code,revision:row.revision,expiresAt:row.expiresAt,data};
  }
  async page(token,code,sourceId){const row=await this.room(token,code);const source=row.state.sources.find(s=>s.id===sourceId);if(!source)throw new ApiError(404,'Page not found.');return source.pageId?this.repo.getPage(source.pageId):null;}
  async export(token,code){const {revision,data}=await this.preview(token,code),pages={};for(const source of data.sources)if(source.pageId)pages[source.id]=await this.repo.getPage(source.pageId);return {format:'data-scrap-poetry-visualization',version:1,createdAt:new Date().toISOString(),roomCode:code,revision,data,pages};}
  async editEntry(token,code,poemId,{revision,name,text}={}){
    const row=await this.room(token,code);checkRevision(row,revision);
    const state=structuredClone(row.state),poem=state.poems.find(p=>p.id===poemId);
    if(!poem)throw new ApiError(404,'Entry not found.');
    if(typeof name!=='string'||!name.trim()||name.trim().length>40)throw new ApiError(400,'Use a name of 1–40 characters.');
    name=name.trim();
    if(state.participants.some(p=>p.id!==poem.authorId&&p.name.toLowerCase()===name.toLowerCase()))throw new ApiError(409,'That name is already in use.');
    if(typeof text!=='string'||text.length>20000)throw new ApiError(400,'Poem is too long.');
    const lines=text.trim()?text.replace(/\r\n?/g,'\n').split('\n').map(line=>line.match(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu)||[]):[[],[],[],[]];
    if(lines.length>6||lines.flat().length>120||lines.flat().some(w=>w.length>1000))throw new ApiError(400,'Use up to 6 lines and 120 words.');
    const byId=new Map(state.blocks.map(b=>[b.id,b]));
    const original=poem.lines.flat().map(id=>byId.get(id)).filter(Boolean),candidates=[...original];
    candidates.push(...state.blocks.filter(b=>b.ownerId===poem.authorId));
    for(const source of state.sources.filter(s=>s.ownerId===poem.authorId&&s.docId)){
      const asset=await this.repo.getAsset(source.docId);candidates.push(...(asset?.blocks||[]));
    }
    const normalize=w=>w.toLowerCase().replaceAll('’',"'"),occurrences=new Map(),available=new Map();
    for(const block of original){const key=normalize(block.text);if(!occurrences.has(key))occurrences.set(key,[]);occurrences.get(key).push(block);}
    for(const block of candidates){const key=normalize(block.text);if(!available.has(key))available.set(key,block);}
    poem.lines=lines.map(line=>line.map(word=>{
      const normalized=normalize(word),match=occurrences.get(normalized)?.shift()||available.get(normalized);
      if(match&&match.text===word){if(!byId.has(match.id)){state.blocks.push(match);byId.set(match.id,match);}return match.id;}
      const block=match?{...match,id:crypto.randomUUID(),text:word}:{id:crypto.randomUUID(),ownerId:poem.authorId,sourceId:null,text:word,start:0,end:word.length,category:'unclassified',receivedOfferId:null};
      state.blocks.push(block);return block.id;
    }));
    state.participants.find(p=>p.id===poem.authorId).name=name;
    if(new TextEncoder().encode(JSON.stringify(state)).length>1400000)throw new ApiError(413,'Room storage is full.');
    if(!await this.repo.editRoom(row,state))throw new ApiError(409,'The room changed. Refresh the room and try again.');
    return {updated:poemId,revision:row.revision+1};
  }
  async editSource(token,code,sourceId,{revision,url,page}={}){
    const row=await this.room(token,code);checkRevision(row,revision);
    const state=structuredClone(row.state),source=state.sources.find(s=>s.id===sourceId);
    if(!source)throw new ApiError(404,'Source not found.');
    if(typeof url!=='string'||url.length>2048)throw new ApiError(400,'Enter a public webpage link.');
    source.url=url.trim()?publicURL(url.trim()).href:null;
    let prepared=null,removeAssets=[];
    if(page!==undefined){
      if(!source.url)throw new ApiError(400,'Enter a link before refreshing the page.');
      const value=validatePage(page);prepared={id:crypto.randomUUID(),value};
      removeAssets=[source.pageId];source.pageId=prepared.id;
    }
    if(!await this.repo.editRoom(row,state,{page:prepared,removeAssets}))throw new ApiError(409,'The room changed. Refresh the room and try again.');
    return {updated:sourceId,revision:row.revision+1};
  }
  async clearWork(token,code,poemId,{revision,scope,confirmation}={}){
    const row=await this.room(token,code);checkRevision(row,revision);
    const state=structuredClone(row.state),poem=state.poems.find(p=>p.id===poemId);
    if(!poem)throw new ApiError(404,'Poem not found.');
    if(!['poem','all'].includes(scope)||confirmation!==poemId)throw new ApiError(400,'Confirm which work to delete.');
    poem.lines=[[],[],[],[]];let removeAssets=[];
    if(scope==='all'){
      const removedSources=state.sources.filter(s=>s.ownerId===poem.authorId),ids=new Set(removedSources.map(s=>s.id));
      removeAssets=removedSources.flatMap(s=>[s.docId,s.pageId]);
      const referenced=new Set(state.poems.flatMap(p=>p.lines.flat()));
      state.blocks=state.blocks.filter(b=>{
        if(b.ownerId===poem.authorId)return false;
        if(!ids.has(b.sourceId))return true;
        if(!referenced.has(b.id))return false;
        // Other poems retain their words, but no path targets a deleted page.
        b.sourceId=null;b.start=0;b.end=b.text.length;b.sourceRemoved=true;return true;
      });
      const kept=new Set(state.blocks.map(b=>b.id));
      state.offers=state.offers.filter(o=>o.senderId!==poem.authorId&&kept.has(o.blockId));
      state.sources=state.sources.filter(s=>!ids.has(s.id));
      if(state._collections)delete state._collections[poem.authorId];
    }
    if(!await this.repo.editRoom(row,state,{removeAssets}))throw new ApiError(409,'The room changed. Refresh the room and try again.');
    return {cleared:poemId,scope,revision:row.revision+1};
  }
  async keepSource(token,code,sourceId,{revision,confirmation}={}){
    const row=await this.room(token,code);checkRevision(row,revision);
    const state=structuredClone(row.state),source=state.sources.find(s=>s.id===sourceId);
    if(!source)throw new ApiError(404,'Source not found.');
    if(confirmation!==sourceId)throw new ApiError(400,'Confirm which source to keep.');
    const removed=state.sources.filter(s=>s.ownerId===source.ownerId&&s.id!==sourceId);
    if(!removed.length)return {kept:sourceId,removed:0,revision:row.revision};
    const sourceText=async s=>{
      if(!s.docId)return s.text||'';
      const asset=await this.repo.getAsset(s.docId);
      if(typeof asset?.source?.text!=='string')throw new ApiError(409,'Source text is unavailable. Nothing was deleted.');
      return asset.source.text;
    };
    const text=await sourceText(source),duplicates=new Set();
    for(const old of removed)if(text&&await sourceText(old)===text)duplicates.add(old.id);
    const ids=new Set(removed.map(s=>s.id)),referenced=new Set(state.poems.flatMap(p=>p.lines.flat()));
    for(const offer of state.offers){referenced.add(offer.blockId);if(offer.receivedBlockId)referenced.add(offer.receivedBlockId);}
    state.blocks=state.blocks.filter(block=>{
      if(!ids.has(block.sourceId))return true;
      // Exact text equality preserves the original offsets and donor provenance.
      if(duplicates.has(block.sourceId)){block.sourceId=sourceId;return true;}
      if(!referenced.has(block.id)&&!block.receivedOfferId)return false;
      block.sourceId=null;block.start=0;block.end=block.text.length;block.sourceRemoved=true;return true;
    });
    state.sources=state.sources.filter(s=>!ids.has(s.id));
    for(const block of state.blocks)if(block.ownerId===source.ownerId&&block.sourceId===sourceId&&!block.receivedOfferId)block.archivedFromCollection=false;
    state._collections ||= {};
    if(source.docId)state._collections[source.ownerId]=sourceId;
    else delete state._collections[source.ownerId];
    if(!await this.repo.editRoom(row,state,{removeAssets:removed.flatMap(s=>[s.docId,s.pageId])}))throw new ApiError(409,'The room changed. Refresh the room and try again.');
    return {kept:sourceId,removed:removed.length,merged:duplicates.size,revision:row.revision+1};
  }
  async remove(token,code,{revision,confirmation}={}){
    const row=await this.room(token,code);
    if(confirmation!==code)throw new ApiError(400,'Type the room code to confirm deletion.');
    if(!Number.isSafeInteger(revision)||row.revision!==revision)throw new ApiError(409,'The room changed. Download its latest data before deleting it.');
    if(!await this.repo.deleteRoom(row,revision))throw new ApiError(409,'The room changed. Download its latest data before deleting it.');
    return {deleted:code};
  }
}
