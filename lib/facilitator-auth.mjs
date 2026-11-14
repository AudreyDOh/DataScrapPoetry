import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const cookieName='poetry_facilitator';
const duration=12*60*60*1000;
const digest=value=>createHash('sha256').update(value).digest();
export function facilitatorAuth(secret,{now=Date.now}={}) {
  const configured=/^[a-f0-9]{64}$/.test(secret||'');
  const sign=value=>createHmac('sha256',secret).update('facilitator-session:'+value).digest('hex');
  function passwordMatches(value){return configured&&typeof value==='string'&&value.length<=256&&timingSafeEqual(digest(value),digest(secret));}
  function session(req){
    if(!configured)return false;
    const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
    const [expires,nonce,signature,...extra]=cookie.split('.');
    if(extra.length||!/^\d{13}$/.test(expires||'')||!Number.isSafeInteger(Number(expires))||Number(expires)<=now()||Number(expires)>now()+duration||!/^[a-f0-9]{32}$/.test(nonce||'')||!/^[a-f0-9]{64}$/.test(signature||''))return false;
    return timingSafeEqual(Buffer.from(sign(expires+'.'+nonce),'hex'),Buffer.from(signature,'hex'));
  }
  function cookie(secure,clear=false){
    const payload=(now()+duration)+'.'+randomBytes(16).toString('hex');
    return `${cookieName}=${clear?'':payload+'.'+sign(payload)}; Path=/api/facilitator; HttpOnly; SameSite=Strict; Max-Age=${clear?0:duration/1000}${secure?'; Secure':''}`;
  }
  return {configured,passwordMatches,session,cookie};
}
