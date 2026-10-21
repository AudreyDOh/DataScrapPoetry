const storageKey='data-scrap-poetry-facilitator';
export function readAccess(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  const incoming=fragment.get('key');
  if(incoming){history.replaceState(null,'',location.pathname+location.search);if(/^[a-f0-9]{64}$/.test(incoming)){sessionStorage.setItem(storageKey,incoming);return incoming;}}
  return sessionStorage.getItem(storageKey)||'';
}
export function rememberAccess(value){sessionStorage.setItem(storageKey,value.trim());}
export function forgetAccess(){sessionStorage.removeItem(storageKey);}
export function accessLink(path,key){const url=new URL(path,location.origin);url.hash=new URLSearchParams({key}).toString();return url.href;}
