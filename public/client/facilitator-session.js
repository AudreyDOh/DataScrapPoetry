import {readAccess,forgetAccess} from './facilitator-access.js';

async function sessionRequest(path,body){
  const response=await fetch('/api/facilitator/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const value=await response.json();
  if(!response.ok)throw new Error(value.error||'Could not sign in. Please retry.');
  return value;
}
export async function signIn(password){
  await sessionRequest('login',{password});
  forgetAccess(); // The session cookie replaces a password in localStorage.
}
export async function signOut(){await sessionRequest('logout',{});forgetAccess();}
export async function restoreSession(){
  const legacy=readAccess();
  if((await sessionRequest('session')).authenticated){forgetAccess();return true;}
  if(!legacy)return false;
  await signIn(legacy);return true;
}
