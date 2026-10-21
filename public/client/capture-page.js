import {pageTags,cleanStyle,imageURL,validatePage} from './page-model.js';
const words=/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*/gu;
const excluded='script,style,noscript,iframe,object,embed,svg,template,form,[hidden],[aria-hidden="true"]';
// Capture HTML structure and the provenance of each extracted word, not a bitmap.
export function capturePage(html,text,groups) {
  const template=document.createElement('template');template.innerHTML=html;
  const root=template.content;
  const base=root.querySelector('base[href]')?.getAttribute('href')||root.querySelector('link[rel="canonical"]')?.getAttribute('href')||root.querySelector('meta[property="og:url"]')?.getAttribute('content');
  const rules=[];
  for(const style of root.querySelectorAll('style')){
    try {const sheet=new CSSStyleSheet();sheet.replaceSync(style.textContent.slice(0,200000));
      const collect=list=>{for(const rule of list){if(rules.length>=1200)break;if(rule.selectorText)rules.push({selector:rule.selectorText,style:cleanStyle(rule.style.cssText)});else if(rule.cssRules&&(!rule.conditionText||matchMedia(rule.conditionText).matches))collect(rule.cssRules);}};collect(sheet.cssRules);
    }catch{}
  }
  const missingStyles=Boolean(root.querySelector('link[rel="stylesheet"]'));
  root.querySelectorAll(excluded).forEach(n=>n.remove());
  const selectors={headings:'h1,h2,h3,h4,h5,h6',paragraphs:'p',lists:'li'};
  const selector=groups.map(g=>selectors[g]).filter(Boolean).join(',');
  const selected=selector?[...root.querySelectorAll(selector)].filter(n=>!n.closest('nav,header,footer,aside')):[];
  const selectedSet=new Set(selected);const top=selected.filter(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(selectedSet.has(p))return false;return true;});
  let key=0,chars=0,truncated=false;const textKeys=new Map();
  function visit(n,depth=0){
    if(key>=5500||depth>=30||chars>60000){truncated=true;return [];}
    if(n.nodeType===3){const content=n.textContent;if(!content.trim())return content.length?[{key:key++,text:' '}]:[];chars+=content.length;textKeys.set(n,key);return [{key:key++,text:content.slice(0,60000)}];}
    if(n.nodeType!==1)return [];
    const tag=n.tagName.toLowerCase();const children=[...n.childNodes].flatMap(c=>visit(c,depth+1));
    if(!pageTags.has(tag))return children;
    const result={key:key++,tag,children,style:cleanStyle(n.getAttribute('style')||'')};
    if(n.id)result.id=n.id;if(n.className)result.class=String(n.className);
    if(tag==='img'){result.src=[n.getAttribute('src'),n.getAttribute('data-src'),n.getAttribute('data-lazy-src'),n.getAttribute('srcset')?.split(',')[0]?.trim().split(/\s+/)[0]].map(value=>imageURL(value,base)).find(Boolean)||null;result.alt=n.getAttribute('alt')||'';}
    return [result];
  }
  const nodes=[...root.childNodes].flatMap(n=>visit(n));
  const candidates=[];
  for(const part of top){const walker=document.createTreeWalker(part,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(!textKeys.has(n))continue;for(const m of n.textContent.matchAll(words))candidates.push({text:m[0],key:textKeys.get(n),offset:m.index,length:m[0].length});}}
  const occurrences=new Map();candidates.forEach((v,i)=>{const list=occurrences.get(v.text)||[];list.push(i);occurrences.set(v.text,list);});
  let cursor=0;const anchors=[];
  for(const match of text.matchAll(words)){const found=occurrences.get(match[0])?.find(i=>i>=cursor);if(found===undefined)continue;const c=candidates[found];anchors.push({key:c.key,offset:c.offset,length:c.length,start:match.index});cursor=found+1;}
  try{return validatePage({version:1,nodes,rules,anchors,truncated,missingStyles});}catch{return {version:1,nodes:[],rules:[],anchors:[],truncated:true,missingStyles};}
}
