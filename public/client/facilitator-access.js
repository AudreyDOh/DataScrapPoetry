const storageKey='data-scrap-poetry-facilitator';
let sessionKey='';
export function readAccess(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  const incoming=fragment.get('key');
  if(incoming){history.replaceState(null,'',location.pathname+location.search);if(/^[a-f0-9]{64}$/.test(incoming)){rememberAccess(incoming);return incoming;}}
  try{return sessionKey||localStorage.getItem(storageKey)||'';}catch{return sessionKey;}
}
export function rememberAccess(value){sessionKey=value.trim();try{localStorage.setItem(storageKey,sessionKey);}catch{}}
export function forgetAccess(){sessionKey='';try{localStorage.removeItem(storageKey);}catch{}}
export function accessLink(path,key){const url=new URL(path,location.origin);url.hash=new URLSearchParams({key}).toString();return url.href;}
