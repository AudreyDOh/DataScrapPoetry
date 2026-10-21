import {buildLayoutSheet} from './layout-sheet.js';
import {validatePage} from '../page-model.js';
const wordPattern=/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
const baseCSS=`:host{display:block;width:800px;color:white;font:15px/1.6 Georgia,serif;contain:layout style} .surface{position:relative;min-height:160px;padding:34px 30px 48px;box-sizing:border-box;border:1px solid #ffffff20;background:transparent} .content{overflow:hidden} *{box-sizing:border-box} img{max-width:100%;height:auto;filter:grayscale(1);opacity:.55} p{margin:0 0 1em} h1{font-size:38px;font-weight:400;line-height:1.18} h2{font-size:25px;font-weight:400} a{color:inherit;text-decoration:none} table{max-width:100%;border-collapse:collapse} .source-name{font:10px/1.5 monospace;letter-spacing:.15em;margin-bottom:26px;opacity:.6} .wv-word{opacity:.65;display:inline!important;font:inherit!important;padding:0!important;margin:0!important;border:0!important} .wv-word.used{opacity:1;text-decoration:underline;text-decoration-color:#ffffff55;text-underline-offset:4px} .wv-word.borrowed{text-decoration-color:#ec7068} .paths{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none} .edited{border-top:1px solid #ffffff22;margin-top:24px;padding-top:12px} .edited-label{font:10px monospace;opacity:.5} .content *{background:transparent!important;background-image:none!important;color:white!important;border-color:#ffffff40!important;box-shadow:none!important;text-shadow:none!important;animation:none!important;transition:none!important;position:static!important;max-width:100%} .content img{filter:grayscale(1)!important} .content [style*="display:none"],.content [style*="display: none"]{display:none!important}`;
export async function buildSheet(source,input,steps=[]) {
  if(input?.version===2){const sheet=await buildLayoutSheet(source,input,steps);decorateSheet(sheet,steps);return sheet;}
  const snapshot=input?.nodes?.length?validatePage(input):null;
  const host=document.createElement('div');host.className='source-sheet';host.dataset.sourceId=source.id;
  const shadow=host.attachShadow({mode:'open'});const style=document.createElement('style');
  style.textContent=baseCSS+'\n'+(snapshot?.rules||[]).map(r=>`${r.selector}{${r.style}}`).join('\n');shadow.append(style);
  const surface=document.createElement('div');surface.className='surface';
  const name=document.createElement('div');name.className='source-name';name.textContent=source.name;
  const content=document.createElement('div');content.className='content';surface.append(name,content);shadow.append(surface);
  const locations=new Map((snapshot?.anchors||[]).map(a=>[`${a.key}:${a.offset}`,a]));
  const spans=new Map();
  function text(value,key){const frag=document.createDocumentFragment();let offset=0;for(const match of value.matchAll(wordPattern)){
    frag.append(document.createTextNode(value.slice(offset,match.index)));const word=document.createElement('span');word.className='wv-word';word.textContent=match[0];
    const a=locations.get(`${key}:${match.index}`);if(a){word.dataset.start=a.start;spans.set(a.start,word);}frag.append(word);offset=match.index+match[0].length;
  }frag.append(document.createTextNode(value.slice(offset)));return frag;}
  function node(n){if(typeof n.text==='string')return text(n.text,n.key);const el=document.createElement(n.tag==='a'?'span':n.tag);if(n.id)el.id=n.id;if(n.class)el.className=n.class;if(n.style)el.style.cssText=n.style;
    if(n.tag==='img'){if(n.src){el.src=n.src;el.referrerPolicy='no-referrer';el.loading='eager';}el.alt=n.alt||'';el.draggable=false;}
    el.append(...n.children.map(node));return el;}
  if(snapshot)content.append(...snapshot.nodes.map(node));
  // Text edited after extraction has no original DOM position. Keep those words
  // explicitly in an appended section instead of inventing a source location.
  const missing=[...source.text.matchAll(wordPattern)].filter(m=>!spans.has(m.index));
  if(missing.length){const extra=document.createElement('div');extra.className=snapshot?'edited':'';if(!snapshot)extra.style.whiteSpace='pre-wrap';
    if(snapshot){const label=document.createElement('div');label.className='edited-label';label.textContent='Extracted text · unmatched words';extra.append(label);}
    if(!snapshot){for(const paragraph of source.text.split(/\n\n/)){const p=document.createElement('p');p.textContent=paragraph;extra.append(p);}extra.replaceChildren();}
    let cursor=0;for(const m of missing){if(!snapshot)extra.append(document.createTextNode(source.text.slice(cursor,m.index)));else extra.append(' ');const el=document.createElement('span');el.className='wv-word';el.dataset.start=m.index;el.textContent=m[0];spans.set(m.index,el);extra.append(el);cursor=m.index+m[0].length;}if(!snapshot)extra.append(document.createTextNode(source.text.slice(cursor)));content.append(extra);
  }
  const measure=document.getElementById('measure');measure.append(host);
  await Promise.race([Promise.all([...shadow.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))),new Promise(resolve=>setTimeout(resolve,2000))]);
  for(const img of shadow.querySelectorAll('img')){if(!img.complete||!img.naturalWidth){img.removeAttribute('src');img.style.display='none';}}
  const width=800;let height=Math.max(160,Math.ceil(surface.getBoundingClientRect().height));host.style.height=`${height}px`;
  const base=surface.getBoundingClientRect(),anchors=new Map();
  for(const [start,el] of spans){const r=el.getBoundingClientRect();if(r.width&&r.height)anchors.set(start,{x:r.x-base.x+r.width/2,y:r.y-base.y+r.height/2});}
  const invisible=[...source.text.matchAll(wordPattern)].filter(m=>!anchors.has(m.index));
  if(invisible.length){const extra=document.createElement('div');extra.className='edited';const label=document.createElement('div');label.className='edited-label';label.textContent='Extracted text · outside the visible layout';extra.append(label);for(const match of invisible){const el=document.createElement('span');el.className='wv-word';el.dataset.start=match.index;el.textContent=match[0];extra.append(el,' ');spans.set(match.index,el);}content.append(extra);height=Math.max(160,Math.ceil(surface.getBoundingClientRect().height));host.style.height=`${height}px`;for(const [start,el] of spans){const r=el.getBoundingClientRect();if(r.width&&r.height)anchors.set(start,{x:r.x-base.x+r.width/2,y:r.y-base.y+r.height/2});}}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.classList.add('paths');surface.append(svg);
  const sheet={element:host,shadow,width,height,anchors,spans,svg,source,snapshot};decorateSheet(sheet,steps);return sheet;
}
export function decorateSheet(sheet,steps){
  const {source,anchors,spans,svg}=sheet;svg.replaceChildren();for(const el of spans.values())el.classList.remove('used','borrowed');
  for(const step of steps){if(step.sourceId!==source.id)continue;const pos=anchors.get(step.start);if(!pos)continue;spans.get(step.start)?.classList.add('used',...(step.borrowed?['borrowed']:[]));const marker=document.createElementNS(svg.namespaceURI,'text');marker.setAttribute('x',pos.x+5);marker.setAttribute('y',pos.y-11);marker.setAttribute('fill',step.borrowed?'#ec7068':'#fff');marker.setAttribute('font-size','9');marker.setAttribute('font-family','monospace');marker.textContent=step.order;svg.append(marker);}
}
export function drawFlatPath(sheet,steps){
  const {source,anchors,svg}=sheet;
  steps.slice(1).forEach((to,i)=>{const from=steps[i];if(from.sourceId!==source.id||to.sourceId!==source.id)return;const a=anchors.get(from.start),b=anchors.get(to.start);if(!a||!b)return;const path=document.createElementNS(svg.namespaceURI,'path');const bend=Math.abs(a.x-b.x)*.1+12;path.setAttribute('d',`M${a.x},${a.y} Q${(a.x+b.x)/2},${(a.y+b.y)/2+bend} ${b.x},${b.y}`);path.setAttribute('fill','none');path.setAttribute('stroke',from.borrowed||to.borrowed?'#ec7068':'#fff');path.setAttribute('stroke-width','1');path.setAttribute('opacity','.6');svg.prepend(path);});
}
