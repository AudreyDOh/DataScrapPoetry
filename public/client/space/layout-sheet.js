import {validateLayout} from '../page-model.js';
import {inBatches} from './loading.js';
const words=/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
const fontsLoaded=new Map();
export async function buildLayoutSheet(source,input,steps=[]){
  const needed=new Set(steps.filter(s=>s.sourceId===source.id).map(s=>s.start));
  const snapshot=validateLayout(input),{width}=snapshot;let {height}=snapshot;
  const host=document.createElement('div');host.className='source-sheet';host.dataset.sourceId=source.id;host.style.width=`${width}px`;
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=`:host{display:block;contain:layout style;color:white}*{box-sizing:border-box}.surface{position:relative;background:transparent;border:1px solid #ffffff18}.fragment{position:absolute;white-space:pre;display:block;padding:0;margin:0;border:0;color:#fff;line-height:1;transform-origin:0 0}.wv-word{opacity:.8}.wv-word.used{opacity:1;text-decoration:underline;text-decoration-color:#ffffff70;text-underline-offset:4px}.wv-word.borrowed{text-decoration-color:#ec7068}.picture{position:absolute;filter:grayscale(1);opacity:.8;pointer-events:none}.paths{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}.edited{position:absolute;left:30px;right:30px;font:16px/1.8 Georgia,serif;border-top:1px solid #ffffff25;padding-top:16px}.edited .wv-word{display:inline}.edited-label{font:11px monospace;opacity:.5;margin-bottom:12px}`;
  shadow.append(style);const surface=document.createElement('div');surface.className='surface';surface.style.width=`${width}px`;shadow.append(surface);
  const fontPromises=snapshot.faces.map(face=>{const key=JSON.stringify(face);if(!fontsLoaded.has(key)){
    const font=new FontFace(face.family,face.urls.map(url=>`url(${JSON.stringify(url)})`).join(','),{weight:face.weight,style:face.style,unicodeRange:face.unicodeRange});document.fonts.add(font);fontsLoaded.set(key,font.load().catch(()=>null));}return fontsLoaded.get(key);});
  await Promise.race([Promise.all(fontPromises),new Promise(resolve=>setTimeout(resolve,3500))]);
  const anchors=new Map(),spans=new Map(),fitted=[];
  await inBatches(snapshot.items,item=>{
    const el=document.createElement(item.type==='image'?'img':'span');
    Object.assign(el.style,{left:`${item.x}px`,top:`${item.y}px`});
    if(item.type==='image'){
      el.className='picture';el.src=item.src;el.alt=item.alt;el.referrerPolicy='no-referrer';el.draggable=false;Object.assign(el.style,{width:`${item.w}px`,height:`${item.h}px`,objectFit:item.fit,objectPosition:item.position});el.onerror=()=>{el.style.display='none';};
    }else{
      const f=snapshot.fonts[item.font];el.className='fragment wv-word';el.textContent=item.text;
      Object.assign(el.style,{fontFamily:f.family,fontSize:`${f.size}px`,fontWeight:f.weight,fontStyle:f.style,letterSpacing:`${f.spacing}px`,textTransform:f.transform,lineHeight:`${item.h}px`});fitted.push([el,item]);
      if(item.start!==undefined){el.dataset.start=item.start;anchors.set(item.start,{x:item.x+item.w/2,y:item.y+item.h/2});spans.set(item.start,el);}
    }
    surface.append(el);
  });
  const missing=[...source.text.matchAll(words)].filter(m=>!anchors.has(m.index));let extra;
  if(missing.length){extra=document.createElement('div');extra.className='edited';extra.style.top=`${height+24}px`;const label=document.createElement('div');label.className='edited-label';label.textContent='Edited or hidden source words';extra.append(label);let plain='';for(const m of missing){if(!needed.has(m.index)){plain+=m[0]+' ';continue;}if(plain){extra.append(document.createTextNode(plain));plain='';}const el=document.createElement('span');el.className='wv-word';el.textContent=m[0];el.dataset.start=m.index;extra.append(el,' ');spans.set(m.index,el);}if(plain)extra.append(document.createTextNode(plain));surface.append(extra);}
  document.getElementById('measure').append(host);
  // Font fallback cannot shift the recorded word endpoints or neighbouring words.
  // Read every width before writing transforms. Interleaved reads/writes force
  // the browser to recalculate style for every single word on a large page.
  const widths=new Array(fitted.length);
  await inBatches(fitted,([el],i)=>{widths[i]=el.getBoundingClientRect().width;});
  await inBatches(fitted,([el,item],i)=>{if(widths[i]>0)el.style.transform=`scaleX(${item.w/widths[i]})`;});
  if(extra){const base=surface.getBoundingClientRect();height+=Math.ceil(extra.getBoundingClientRect().height)+60;for(const m of missing){if(!spans.has(m.index))continue;const b=spans.get(m.index).getBoundingClientRect();anchors.set(m.index,{x:b.x-base.x+b.width/2,y:b.y-base.y+b.height/2});}}
  surface.style.height=`${height}px`;host.style.height=`${height}px`;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('paths');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);surface.append(svg);
  return {element:host,shadow,width,height,anchors,spans,svg,source,snapshot};
}
