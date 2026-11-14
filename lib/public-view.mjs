// Only this allowlisted projection reaches unauthenticated visitors.
export function publicView(data){
  return {version:1,
    sources:data.sources.map(s=>({id:s.id,pageId:s.pageId||null,url:s.url||null,name:s.name,text:s.text})),
    poems:data.poems.map(p=>({id:p.id,name:p.name,sourceIds:p.sourceIds,lines:p.lines.map(line=>line.map(w=>({text:w.text,sourceId:w.sourceId,start:w.start,borrowed:Boolean(w.borrowed),...(w.unlinked?{unlinked:true}:{})})))}))
  };
}

// Cache bytes, not another durable copy of a workshop. Restarts may clear it.
export function publicCache({now=Date.now,maxBytes=24*1024*1024,maxEntries=64}={}){
  const entries=new Map(),pending=new Map();let size=0,generation=0;
  function remove(key){const item=entries.get(key);if(item){size-=item.body.length;entries.delete(key);}}
  return {
    async get(key,load,ttl=15000){
      const hit=entries.get(key);if(hit&&hit.until>now())return hit.body;
      remove(key);if(pending.has(key))return pending.get(key);
      const started=generation;
      const task=(async()=>{
        const body=Buffer.from(JSON.stringify(await load()));
        if(started===generation&&body.length<=4*1024*1024){
          while(entries.size&&(size+body.length>maxBytes||entries.size>=maxEntries))remove(entries.keys().next().value);
          if(body.length<=maxBytes){entries.set(key,{body,until:now()+ttl});size+=body.length;}
        }
        return body;
      })();
      pending.set(key,task);
      try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
    },
    clear(){generation++;entries.clear();pending.clear();size=0;}
  };
}
