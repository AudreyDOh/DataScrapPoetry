import {mkdirSync, existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

// A small, file-backed adapter for the temporary Render restoration. It uses a
// single JSON document so it can be placed on a Render persistent disk later.
// The public API matches the original D1 repository, preserving workshop rules.
export function localRepository(file) {
  let data={rooms:{},assets:{},pages:{},galleries:{}};
  function load(){
    if(!existsSync(file))return;
    const value=JSON.parse(readFileSync(file,'utf8'));
    if(value&&typeof value==='object')data={rooms:value.rooms||{},assets:value.assets||{},pages:value.pages||{},galleries:value.galleries||{}};
  }
  function save(){
    mkdirSync(dirname(file),{recursive:true});
    const next=file+'.next';writeFileSync(next,JSON.stringify(data));renameSync(next,file);
  }
  function clone(value){return value===undefined?value:structuredClone(value);}
  load();
  return {
    async putAsset(id,code,value){
      if(!data.rooms[code])return;
      data.assets[id]={code,value:clone(value)};save();
    },
    async getAsset(id){return clone(data.assets[id]?.value)||null;},
    async putPage(id,page,code){if(!data.rooms[code])return;data.pages[id]=clone(page);save();},
    async getPage(id){return clone(data.pages[id])||null;},
    async putGallery(id,value,revision){data.galleries[id]={data:clone(value),revision};save();},
    async galleryRoom(id){return Object.values(data.rooms).find(row=>row.state.galleryId===id)?.code||null;},
    async getGallery(id){return clone(data.galleries[id]?.data)||null;},
    async create(row){if(data.rooms[row.code])return false;data.rooms[row.code]=clone(row);save();return true;},
    async read(code){return clone(data.rooms[code])||null;},
    async listRooms(after=''){
      const rooms=Object.values(data.rooms).filter(row=>row.code>after).sort((a,b)=>a.code.localeCompare(b.code)).slice(0,51).map(row=>({
        code:row.code,revision:row.revision,expiresAt:row.expiresAt,participants:row.state.participants.length,sources:row.state.sources.length,shared:row.state.offers.length,storedBytes:Buffer.byteLength(JSON.stringify(row))
      }));
      return {rooms:rooms.slice(0,50),next:rooms.length>50?rooms[49].code:null};
    },
    async compareAndSwap(code,revision,state){const row=data.rooms[code];if(!row||row.revision!==revision)return false;row.state=clone(state);row.revision++;save();return true;},
    async editRoom(old,state,{page=null,removeAssets=[]}={}){
      const row=data.rooms[old.code];if(!row||row.revision!==old.revision)return false;
      if(page)data.pages[page.id]=clone(page.value);
      for(const id of removeAssets){delete data.assets[id];delete data.pages[id];}
      row.state=clone(state);row.revision++;save();return true;
    },
    async deleteRoom(old,revision){const row=data.rooms[old.code];if(!row||row.revision!==revision)return false;delete data.rooms[old.code];for(const [id,asset] of Object.entries(data.assets))if(asset.code===old.code)delete data.assets[id];save();return true;},
    async rotate(old,revision,next){const row=data.rooms[old.code];if(!row||row.revision!==revision||data.rooms[next.code])return false;delete data.rooms[old.code];data.rooms[next.code]=clone(next);save();return true;},
    // Import is deliberately overwrite-protected: a populated code can never
    // be replaced by a retry or a later request.
    async restore(row,assets={},pages={}){if(data.rooms[row.code])return false;data.rooms[row.code]=clone(row);for(const [id,value] of Object.entries(assets))data.assets[id]={code:row.code,value:clone(value)};Object.assign(data.pages,clone(pages));save();return true;}
  };
}
