// Only this declarative subset is ever saved or rendered. No original scripts,
// events, forms, embedded documents, or executable CSS enter the live page.
export const pageTags = new Set('div main article section header footer nav aside p h1 h2 h3 h4 h5 h6 span strong em b i u small a ul ol li blockquote pre code br hr figure figcaption img table thead tbody tr td th dl dt dd sup sub'.split(' '));
const properties = new Set('display width max-width min-width height max-height min-height margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left gap row-gap column-gap grid-template-columns grid-template-rows grid-column grid-row flex flex-direction flex-wrap justify-content align-items align-self order font-size font-family font-weight font-style line-height letter-spacing text-align text-transform white-space float clear vertical-align border-width border-top-width border-bottom-width border-style border-radius list-style-type columns column-count column-width'.split(' '));
export function cleanStyle(style = '') {
  return String(style).split(';').flatMap(declaration => {
    const colon=declaration.indexOf(':');if(colon<0)return [];
    const name=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim();
    if(!properties.has(name)||value.length>180||/[\\@{}<>]/.test(value)||/url\s*\(|expression|var\s*\(|attr\s*\(|!important/i.test(value))return [];
    if(!/^[\w\s.,%#()'"+*/-]+$/.test(value))return [];
    return [`${name}:${value}`];
  }).join(';');
}
export function imageURL(value, base) {
  if(typeof value!=='string'||!value.trim())return null;
  try { const url=new URL(value,base);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null; } catch {return null;}
}
export function validatePage(input) {
  if(input?.version===2)return validateLayout(input);
  if(!input||input.version!==1||!Array.isArray(input.nodes))throw new Error('Invalid page snapshot.');
  if(JSON.stringify(input).length>300000)throw new Error('Page snapshot is too large.');
  let count=0,characters=0;const keys=new Set();
  function node(n,depth=0){
    if(++count>6000||depth>32||!n||!Number.isInteger(n.key)||keys.has(n.key))throw new Error('Page structure is too large or invalid.');keys.add(n.key);
    if(typeof n.text==='string'){characters+=n.text.length;if(characters>65000)throw new Error('Page text is too long.');return {key:n.key,text:n.text};}
    if(!pageTags.has(n.tag))throw new Error('Invalid page element.');
    const result={key:n.key,tag:n.tag,children:(Array.isArray(n.children)?n.children:[]).map(c=>node(c,depth+1))};
    if(typeof n.style==='string')result.style=cleanStyle(n.style);
    for(const attr of ['class','id'])if(typeof n[attr]==='string')result[attr]=n[attr].replace(/[^a-zA-Z0-9_ -]/g,'').slice(0,200);
    if(n.tag==='img'){result.src=imageURL(n.src);result.alt=String(n.alt||'').slice(0,200);}
    return result;
  }
  const nodes=input.nodes.map(n=>node(n));
  const rules=(Array.isArray(input.rules)?input.rules:[]).slice(0,1200).flatMap(r=>{
    if(typeof r.selector!=='string'||r.selector.length>300||!/^[a-zA-Z0-9_\s.#,>+~*:\[\]="'-]+$/.test(r.selector)||/:has|:host|::|\[/.test(r.selector))return [];
    return [{selector:r.selector,style:cleanStyle(r.style)}];
  });
  const anchors=(Array.isArray(input.anchors)?input.anchors:[]).slice(0,9000).filter(a=>keys.has(a.key)&&['key','offset','start','length'].every(k=>Number.isInteger(a[k])&&a[k]>=0)&&a.length<300).map(({key,offset,start,length})=>({key,offset,start,length}));
  return {version:1,nodes,rules,anchors,truncated:Boolean(input.truncated),missingStyles:Boolean(input.missingStyles)};
}

// Version 2 is a browser-measured layout: only text, boxes, image/font URLs.
// Coordinates are immutable, so borrowed-word paths survive layout changes.
export function validateLayout(input){
  if(!input||input.version!==2||!Array.isArray(input.items)||JSON.stringify(input).length>1250000)throw new Error('Page layout is too large or invalid.');
  const width=Number(input.width),height=Number(input.height);
  if(!Number.isFinite(width)||width<100||width>1800||!Number.isFinite(height)||height<100||height>20000)throw new Error('Invalid page dimensions.');
  const safeText=(v,n=160)=>String(v||'').slice(0,n);
  const bounded=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
  const fonts=(Array.isArray(input.fonts)?input.fonts:[]).slice(0,400).map(f=>({family:safeText(f.family),size:bounded(f.size,1,500)?f.size:16,weight:/^(normal|bold|[1-9]00)$/.test(f.weight)?f.weight:'normal',style:['normal','italic','oblique'].includes(f.style)?f.style:'normal',spacing:bounded(f.spacing,-30,100)?f.spacing:0,transform:['uppercase','lowercase','capitalize'].includes(f.transform)?f.transform:'none'}));
  if(input.items.length>9500)throw new Error('This page contains too many elements.');
  let characters=0;const starts=new Set();
  const items=input.items.flatMap(i=>{
    if(!i||!bounded(i.x,0,width)||!bounded(i.y,0,height)||!bounded(i.w,.1,20000)||!bounded(i.h,.1,20000))return [];
    const box={type:i.type,x:i.x,y:i.y,w:i.w,h:i.h};
    if(i.type==='text'&&typeof i.text==='string'&&Number.isInteger(i.font)&&fonts[i.font]){characters+=i.text.length;if(characters>70000)throw new Error('Page text is too long.');const item={...box,text:i.text.slice(0,1000),font:i.font};if(Number.isInteger(i.start)&&i.start>=0&&i.start<18000&&!starts.has(i.start)){item.start=i.start;starts.add(i.start);}return [item];}
    if(i.type==='image'&&imageURL(i.src))return [{...box,src:imageURL(i.src),alt:safeText(i.alt),fit:['cover','contain','fill','none','scale-down'].includes(i.fit)?i.fit:'fill',position:/^[\d.%\s-]+$/.test(i.position||'')?i.position:'50% 50%'}];
    return [];
  });
  const faces=(Array.isArray(input.faces)?input.faces:[]).slice(0,80).flatMap(f=>{
    if(!/^[a-zA-Z0-9 _-]{1,120}$/.test(f.family))return [];const urls=(Array.isArray(f.urls)?f.urls:[]).slice(0,4).map(u=>imageURL(u)).filter(Boolean);return urls.length?[{family:f.family,weight:/^(normal|bold|[1-9]00)( [1-9]00)?$/.test(f.weight)?f.weight:'normal',style:['normal','italic','oblique'].includes(f.style)?f.style:'normal',unicodeRange:/^[Uu+0-9A-Fa-f?,\s-]+$/.test(f.unicodeRange||'')?f.unicodeRange:'U+0-10FFFF',urls}]:[];
  });
  return {version:2,width,height,items,fonts,faces,truncated:Boolean(input.truncated),missingStyles:Boolean(input.missingStyles)};
}
