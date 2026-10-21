import {validateLayout, imageURL} from './page-model.js';
import {htmlTextRuns} from './html-text.js';
const wordPattern=/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
const r=n=>Math.round(n*10)/10;
function asset(value,base){if(typeof value!=='string'||!value.trim())return null;let absolute;try{absolute=new URL(value,base);if(absolute.protocol==='http:')absolute.protocol='https:';}catch{return null;}const url=imageURL(absolute.href);if(!url)return null;const host=new URL(url).hostname;return host.includes('.')&&!/^[\d.]+$/.test(host)&&!host.includes(':')&&!/(^|\.)(local|localhost|internal|lan|home)$/.test(host)?url:null;}
function cssURLs(css,base){return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,q,url)=>`url("${asset(url,base)||''}")`);}
// Original scripts never run. CSS is used only inside a script-disabled frame;
// the saved result contains measured text/image boxes, not executable markup.
export async function captureLayout(html,text,groups,base,loadStyle){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const baseHref=doc.querySelector('base[href]')?.getAttribute('href');
  try{base=new URL(baseHref||base,base).href;}catch{}
  doc.querySelectorAll('script,noscript,iframe,frame,frameset,object,embed,template,portal,base,meta,video,audio,source,track').forEach(n=>n.remove());
  const imports=new Set();let styleCount=0,missingStyles=false;
  async function cssText(css,url,depth=0){
    const matches=[...css.matchAll(/@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi)];
    for(const match of matches){let replacement='';const target=asset(match[2]||match[4],url);
      if(target&&depth<2&&styleCount<16&&!imports.has(target)){imports.add(target);styleCount++;try{const result=await loadStyle(target);replacement=await cssText(result.html,result.url,depth+1);if(match[5].trim())replacement=`@media ${match[5]}{${replacement}}`;}catch{missingStyles=true;}}
      else missingStyles=true;css=css.replace(match[0],replacement);
    }
    // Unhandled CSS imports cannot silently load in the measurement frame.
    return cssURLs(css.replace(/@import[^;]*;/gi,''),url);
  }
  const styleNodes=[...doc.querySelectorAll('style,link')];
  await Promise.all(styleNodes.map(async node=>{
    if(node.tagName==='LINK'){
      const href=asset(node.getAttribute('href'),base);if(node.rel!=='stylesheet'||!href){node.remove();return;}
      const style=doc.createElement('style');if(node.media)style.media=node.media;node.replaceWith(style);
      if(styleCount++>=16){missingStyles=true;return;}
      try{const result=await loadStyle(href);style.textContent=await cssText(result.html,result.url);}catch{missingStyles=true;}
    }else node.textContent=await cssText(node.textContent,base);
  }));
  for(const el of doc.querySelectorAll('*')){
    const responsive=el.getAttribute('srcset')?.split(',').pop()?.trim().split(/\s+/)[0];
    for(const attr of [...el.attributes])if(/^on/i.test(attr.name)||['srcdoc','nonce','integrity','autofocus','formaction','action','target','ping','download','href','srcset','sizes','background'].includes(attr.name))el.removeAttribute(attr.name);
    if(el.hasAttribute('style'))el.setAttribute('style',cssURLs(el.getAttribute('style'),base));
    if(el.tagName==='IMG'){
      const src=[el.getAttribute('data-src'),el.getAttribute('data-lazy-src'),responsive,el.getAttribute('src')].map(v=>asset(v,base)).find(Boolean);
      el.removeAttribute('src');if(src)el.setAttribute('src',src);el.setAttribute('loading','eager');el.setAttribute('referrerpolicy','no-referrer');
    }else el.removeAttribute('src');
    if(el.tagName==='A')el.removeAttribute('href');
  }
  doc.querySelectorAll('svg').forEach(n=>n.remove());
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https:; font-src https:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";doc.head.prepend(csp);
  const freeze=doc.createElement('style');freeze.textContent='*{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}';doc.head.append(freeze);
  const frame=document.createElement('iframe');frame.title='Page layout capture';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.sandbox='allow-same-origin';frame.referrerPolicy='no-referrer';
  frame.style.cssText='position:fixed;left:-20000px;top:0;width:1200px;height:900px;border:0;pointer-events:none;visibility:hidden';
  try{
    const loaded=new Promise(resolve=>{frame.onload=resolve;});frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;document.body.append(frame);
    await Promise.race([loaded,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Page layout timed out. Please try again.')),12000))]);
    const live=frame.contentDocument,win=frame.contentWindow;
    await Promise.race([Promise.all([live.fonts.ready,...[...live.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))]),new Promise(resolve=>setTimeout(resolve,5000))]);
    const locations=new WeakMap(),candidates=[];
    for(const run of htmlTextRuns(live.body,groups))for(const n of run.nodes)for(const m of n.textContent.matchAll(wordPattern))candidates.push({node:n,offset:m.index,text:m[0]});
    const occurrences=new Map();candidates.forEach((c,i)=>{if(!occurrences.has(c.text))occurrences.set(c.text,[]);occurrences.get(c.text).push(i);});
    let cursor=0;const usedCandidates=new Set();for(const m of text.matchAll(wordPattern)){const choices=occurrences.get(m[0]);const index=choices?.find(i=>i>=cursor&&!usedCandidates.has(i))??choices?.find(i=>!usedCandidates.has(i));if(index===undefined)continue;usedCandidates.add(index);const c=candidates[index];if(!locations.has(c.node))locations.set(c.node,new Map());locations.get(c.node).set(c.offset,m.index);cursor=index+1;}
    const fonts=[],fontMap=new Map(),items=[];let truncated=false;
    const height=Math.min(20000,Math.max(900,live.documentElement.scrollHeight,live.body.scrollHeight));
    const width=Math.min(1800,Math.max(1200,live.documentElement.scrollWidth));
    const walker=live.createTreeWalker(live.body,NodeFilter.SHOW_TEXT);let chars=0;
    while(walker.nextNode()){
      const n=walker.currentNode,el=n.parentElement;if(!n.textContent.trim()||el.closest('style,script,textarea,select'))continue;
      if(items.length>=9000||chars>65000){truncated=true;break;}
      const s=win.getComputedStyle(el);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)continue;
      const font={family:s.fontFamily,size:parseFloat(s.fontSize),weight:s.fontWeight,style:s.fontStyle,spacing:parseFloat(s.letterSpacing)||0,transform:s.textTransform};
      const key=JSON.stringify(font);if(!fontMap.has(key)){fontMap.set(key,fonts.length);fonts.push(font);}const fontIndex=fontMap.get(key);
      const add=(from,to,start)=>{if(items.length>=9000||chars>=65000){truncated=true;return;}const value=n.textContent.slice(from,to);if(!value.trim())return;const range=live.createRange();range.setStart(n,from);range.setEnd(n,to);const b=range.getBoundingClientRect();if(!b.width||!b.height||b.x<0||b.y<0||b.y+b.height>height||b.x>width)return;const item={type:'text',text:value,font:fontIndex,x:r(b.x),y:r(b.y),w:r(b.width),h:r(b.height)};if(start!==undefined)item.start=start;items.push(item);chars+=value.length;};
      let offset=0;for(const match of n.textContent.matchAll(wordPattern)){add(offset,match.index);add(match.index,match.index+match[0].length,locations.get(n)?.get(match.index));offset=match.index+match[0].length;}add(offset,n.textContent.length);
    }
    const backgrounds=[];
    for(const el of [...live.querySelectorAll('body *')].slice(0,6000)){
      const s=win.getComputedStyle(el),b=el.getBoundingClientRect();if(b.width<=3||b.height<=3||b.x<0||b.y<0||b.bottom>height||s.display==='none'||s.visibility!=='visible')continue;
      const urls=[...s.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)].map(m=>asset(m[1],base)).filter(Boolean).reverse();
      for(const src of urls)backgrounds.push({type:'image',src,alt:'',x:r(b.x),y:r(b.y),w:r(b.width),h:r(b.height),fit:s.backgroundSize==='contain'?'contain':'cover',position:s.backgroundPosition});if(backgrounds.length>=100)break;
    }
    items.unshift(...backgrounds);
    for(const img of live.images){const b=img.getBoundingClientRect(),s=win.getComputedStyle(img);if(!img.naturalWidth||b.width<3||b.height<3||b.x<0||b.y<0||b.bottom>height||s.visibility!=='visible'||s.display==='none')continue;const src=asset(img.currentSrc||img.src,base);if(src)items.push({type:'image',src,alt:img.alt||'',x:r(b.x),y:r(b.y),w:r(b.width),h:r(b.height),fit:s.objectFit,position:s.objectPosition});}
    const faces=[];
    function faceRules(rules){for(const rule of rules){if(rule.type===5){const s=rule.style;const urls=[...s.getPropertyValue('src').matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m=>asset(m[1],base)).filter(Boolean);if(urls.length)faces.push({family:s.getPropertyValue('font-family').replace(/['"]/g,''),weight:s.getPropertyValue('font-weight')||'normal',style:s.getPropertyValue('font-style')||'normal',unicodeRange:s.getPropertyValue('unicode-range')||'U+0-10FFFF',urls});}else if(rule.cssRules)faceRules(rule.cssRules);}}
    for(const sheet of live.styleSheets){try{faceRules(sheet.cssRules);}catch{}}
    if(!items.some(i=>i.type==='text'))throw new Error('This page needs JavaScript or a login to display its text. Paste the visible page HTML instead.');
    return validateLayout({version:2,width,height,items,fonts,faces,truncated:truncated||live.documentElement.scrollHeight>height,missingStyles});
  }finally{frame.remove();}
}
