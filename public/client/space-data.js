// A public projection: no room code, session, unused word collection or private
// author IDs. Every occurrence retains the original source and text offset.
export function galleryData(room) {
  const blocks=new Map(room.blocks.map(b=>[b.id,b]));
  const names=new Map(room.participants.map(p=>[p.id,p.name]));
  const sources=room.sources.map(s=>({id:s.id,pageId:s.pageId||null,url:s.url||null,name:names.get(s.ownerId)||'Participant',text:s.text}));
  const poems=room.poems.map(p=>({id:p.id,name:names.get(p.authorId)||'Participant',sourceIds:room.sources.filter(s=>s.ownerId===p.authorId).map(s=>s.id),lines:p.lines.map(line=>line.flatMap(id=>{
    const b=blocks.get(id);return b?[{text:b.text,sourceId:b.sourceId,start:b.start,borrowed:Boolean(b.receivedOfferId),...(!b.sourceId?{unlinked:true}:{})}]:[];
  }))}));
  return {version:1,sources,poems};
}
export function poemSteps(poem){return poem.lines.flatMap((line,row)=>line.map((word,column)=>({...word,row,column}))).map((word,index)=>({...word,order:index+1}));}
