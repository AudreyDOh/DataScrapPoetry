import {validatePage} from '../page-model.js';
// Archives contain visual material only, never membership tokens or editable rooms.
export function readArchive(value){
  if(value?.format!=='data-scrap-poetry-visualization'||value.version!==1||!Array.isArray(value.data?.sources)||!Array.isArray(value.data?.poems))throw new Error('Choose a Data-Scrap-Poetry visualization file.');
  if(value.data.sources.length>300||value.data.poems.length>20)throw new Error('This archive is too large.');
  const ids=new Set(),sources=value.data.sources.map(s=>{
    if(typeof s.id!=='string'||s.id.length>80||ids.has(s.id)||typeof s.text!=='string'||s.text.length>100000)throw new Error('Invalid archive source.');ids.add(s.id);
    return {id:s.id,name:String(s.name||'Participant').slice(0,40),text:s.text,url:typeof s.url==='string'?s.url:null,pageId:null};
  });
  const poems=value.data.poems.map(p=>{
    if(!Array.isArray(p.lines)||p.lines.length>6||!p.lines.every(Array.isArray)||p.lines.flat().length>120)throw new Error('Invalid archive poem.');
    return {id:String(p.id).slice(0,80),name:String(p.name||'Participant').slice(0,40),sourceIds:(Array.isArray(p.sourceIds)?p.sourceIds:[]).filter(id=>ids.has(id)),lines:p.lines.map(line=>line.map(w=>{
      if(!ids.has(w.sourceId)||typeof w.text!=='string'||w.text.length>1000||!Number.isInteger(w.start)||w.start<0)throw new Error('Invalid archive word.');
      return {sourceId:w.sourceId,text:w.text,start:w.start,borrowed:Boolean(w.borrowed)};
    }))};
  });
  const pages={};for(const source of sources)if(value.pages?.[source.id])pages[source.id]=validatePage(value.pages[source.id]);
  return {data:{version:1,sources,poems},pages};
}
