// Read public HTML only. Every redirect and DNS answer is checked before fetching.
export function publicURL(value) {
  let url;try{url=new URL(value);}catch{throw new Error('Enter a public webpage link.');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port))||!host.includes('.')||/^[\d.]+$/.test(host)||host.includes(':')||/(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(host))throw new Error('Use a public http or https webpage link.');
  url.hash='';return url;
}
export function publicAddress(ip){
  if(ip.includes(':'))return /^2[0-9a-f]{3}:/i.test(ip)&&!/^2001:(db8|0):/i.test(ip)&&!/^2002:/i.test(ip);
  const p=ip.split('.').map(Number);return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&p[0]!==0&&p[0]!==10&&p[0]!==127&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&(p[1]===168||p[1]===0))&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19,51].includes(p[1]))&&!(p[0]===203&&p[1]===0&&p[2]===113);
}
export async function fetchPage(value,{fetcher=fetch,resolve,style=false}={}){
  const signal=AbortSignal.timeout(14000);
  resolve||=async host=>{
    const results=await Promise.all(['A','AAAA'].map(async type=>{
      const r=await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{Accept:'application/dns-json'},signal});
      if(!r.ok)throw new Error('Could not resolve this website.');const data=await r.json();return (data.Answer||[]).filter(a=>a.type===1||a.type===28).map(a=>a.data);
    }));return results.flat();
  };
  let url=publicURL(value);
  for(let redirects=0;redirects<=4;redirects++){
    const addresses=await resolve(url.hostname);if(!addresses.length||addresses.some(ip=>!publicAddress(ip)))throw new Error('This link does not resolve to a public website.');
    const response=await fetcher(url.href,{redirect:'manual',signal,headers:{Accept:style?'text/css':'text/html,application/xhtml+xml','User-Agent':'PoetryWorkshop/1.0 (public webpage capture)'}});
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw new Error('This website returned an empty redirect.');url=publicURL(new URL(next,url).href);continue;}
    if(!response.ok){await response.body?.cancel();throw new Error(`This website could not be loaded (${response.status}). Paste its HTML instead.`);}
    if(!(style?/text\/css/i:/text\/html|application\/xhtml\+xml/i).test(response.headers.get('content-type')||'')){await response.body?.cancel();throw new Error('This link must point to a webpage.');}
    const reader=response.body.getReader();const chunks=[];let size=0;
    try{while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>(style?1000000:3000000))throw new Error('This webpage is too large. Paste a smaller HTML selection.');chunks.push(chunk);}}finally{await reader.cancel();}
    const buffer=new Uint8Array(size);let pos=0;for(const chunk of chunks){buffer.set(chunk,pos);pos+=chunk.byteLength;}
    const encoding=response.headers.get('content-type')?.match(/charset=["']?([\w-]+)/i)?.[1]||'utf-8';let decoder;try{decoder=new TextDecoder(encoding);}catch{decoder=new TextDecoder();}
    return {url:url.href,html:decoder.decode(buffer)};
  }
  throw new Error('This webpage redirects too many times.');
}
