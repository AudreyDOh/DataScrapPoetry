import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {facilitatorAuth} from './lib/facilitator-auth.mjs';
import {publicCache,publicView} from './lib/public-view.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const defaultApi = 'https://data-scrap-poetry.amazingsriracha.chatgpt.site';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const maxBody = 2000000;
function json(res, status, value) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value));}

export function workshopServer({apiOrigin=process.env.WORKSHOP_API_ORIGIN || defaultApi, externalOrigin=process.env.RENDER_EXTERNAL_URL, facilitatorKey=process.env.FACILITATOR_API_KEY, fetcher=fetch, now=Date.now} = {}) {
  const upstream = new URL(apiOrigin);
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw new Error('WORKSHOP_API_ORIGIN must be an https origin.');
  const auth=facilitatorAuth(facilitatorKey,{now}),cache=publicCache({now}),failures=new Map();
  let activePublic=0;
  async function viewRead(path){
    if(activePublic>=8)throw Object.assign(new Error('Please retry in a moment.'),{status:429});
    activePublic++;
    try{
      const response=await fetcher(upstream.origin+'/api/facilitator/'+path,{headers:{Accept:'application/json',Authorization:'Bearer '+facilitatorKey},redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Object.assign(new Error(response.status===404?'Room or page not found.':'Visualization is temporarily unavailable. Please retry.'),{status:response.status===404?404:503});
      if(!response.headers.get('content-type')?.includes('application/json'))throw Object.assign(new Error('Visualization is temporarily unavailable. Please retry.'),{status:503});
      return response.json();
    }finally{activePublic--;}
  }
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost');
      const allowed = externalOrigin ? new URL(externalOrigin).origin : `http://${req.headers.host}`;
      const origin = req.headers.origin;
      if (url.pathname === '/healthz') return json(res, 200, {ok:true});
      if(url.pathname.startsWith('/api/public/')){
        if(req.method!=='GET')return json(res,405,{error:'Read-only visualization.'});
        if(!auth.configured)return json(res,503,{error:'Public visualization is not configured yet.'});
        const match=url.pathname.match(/^\/api\/public\/rooms\/([A-Z0-9]{6,10})\/(view|revision)(?:\/pages\/([a-zA-Z0-9_-]{1,80}))?$/);
        if(!match||(match[2]==='revision'&&match[3]))return json(res,404,{error:'Not found.'});
        const [,code,kind,sourceId]=match;
        const body=await cache.get(code,async()=>{
          const value=await viewRead('rooms/'+code);
          return {...publicView(value.data),revision:value.revision};
        });
        const data=JSON.parse(body);
        if(kind==='revision')return json(res,200,{revision:data.revision});
        let result=body;
        if(sourceId){
          if(!data.sources.some(s=>s.id===sourceId))return json(res,404,{error:'Page not found.'});
          result=await cache.get(code+'/'+data.revision+'/'+sourceId,()=>viewRead(`rooms/${code}/view/pages/${sourceId}`),60000);
        }
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':result.length});return res.end(result);
      }
      if (url.pathname.startsWith('/api/')) {
        if (!['GET','POST'].includes(req.method)) return json(res, 405, {error:'Method not allowed.'});
        if (origin && origin !== allowed) return json(res, 403, {error:'Invalid origin.'});
        const managed=url.pathname.startsWith('/api/facilitator/');
        // Cookie-authenticated writes and login require our origin, not just a cookie.
        if(managed&&req.method==='POST'&&origin!==allowed)return json(res,403,{error:'Invalid origin.'});
        const login=url.pathname==='/api/facilitator/login';
        const limit=login?1024:maxBody;
        if (Number(req.headers['content-length'] || 0) > limit) return json(res, 413, {error:'Request too large.'});
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > limit) return json(res, 413, {error:'Request too large.'});
          chunks.push(chunk);
        }
        if(login){
          if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
          if(!auth.configured)return json(res,503,{error:'Facilitator sign-in is temporarily unavailable.'});
          const address=req.socket.remoteAddress||'unknown',period=Math.floor(now()/60000);
          for(const [key,value] of failures)if(value.period!==period)failures.delete(key);
          const attempts=failures.get(address)||{period,count:0};
          if(attempts.count>=10){res.setHeader('Retry-After','60');return json(res,429,{error:'Too many attempts. Wait one minute and try again.'});}
          let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{return json(res,400,{error:'Enter your facilitator password.'});}
          if(!auth.passwordMatches(typeof input.password==='string'?input.password.trim():null)){
            attempts.count++;if(failures.size<1000||failures.has(address))failures.set(address,attempts);
            return json(res,401,{error:'Incorrect facilitator password.'});
          }
          failures.delete(address);res.setHeader('Set-Cookie',auth.cookie(allowed.startsWith('https:')));return json(res,200,{authenticated:true});
        }
        if(url.pathname==='/api/facilitator/logout'){
          if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
          res.setHeader('Set-Cookie',auth.cookie(allowed.startsWith('https:'),true));return json(res,200,{authenticated:false});
        }
        if(url.pathname==='/api/facilitator/session'){
          if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
          return json(res,200,{authenticated:auth.session(req)});
        }
        const cookieSession=managed&&auth.session(req);
        const bearer=req.headers.authorization?.replace(/^Bearer /,'')||'';
        if(managed&&auth.configured&&!cookieSession&&!auth.passwordMatches(bearer))return json(res,401,{error:'Sign in with your facilitator password.'});
        // Only the exact public read routes above can use the server credential
        // without authentication. Cookies are never sent to the upstream server.
        const headers = {Accept:'application/json', Origin:upstream.origin};
        if(cookieSession)headers.Authorization='Bearer '+facilitatorKey;
        else if(req.headers.authorization)headers.Authorization=req.headers.authorization;
        if (req.method === 'POST') headers['Content-Type'] = 'application/json';
        const response = await fetcher(`${upstream.origin}${url.pathname}${url.search}`, {
          method:req.method, headers, body:req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          redirect:'error', signal:AbortSignal.timeout(30000),
        });
        if (!response.headers.get('content-type')?.includes('application/json')) return json(res, 502, {error:'Workshop server unavailable. Please retry.'});
        if(managed&&req.method==='POST'&&response.ok)cache.clear();
        res.writeHead(response.status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        for await (const chunk of response.body || []) res.write(chunk);
        return res.end();
      }
      if (!['GET','HEAD'].includes(req.method)) return json(res, 405, {error:'Method not allowed.'});
      const aliases = {'/':'workshop.html','/workshop':'workshop.html','/space':'space.html','/facilitator':'facilitator.html'};
      const pathname = decodeURIComponent(url.pathname);
      const path = resolve(publicDir, aliases[pathname] || '.' + pathname);
      if (!path.startsWith(publicDir.endsWith(sep) ? publicDir : publicDir + sep) || !(await stat(path).catch(() => null))?.isFile()) return json(res, 404, {error:'Not found.'});
      const file = await readFile(path);
      res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream','Content-Length':file.length,'Cache-Control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch(error) {
      if (!res.headersSent) json(res, error.status||502, {error:error.status?error.message:'Workshop server unavailable. Please retry.'});
      else res.destroy();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 10000);
  workshopServer().listen(port, '0.0.0.0', () => console.log(`Data-Scrap-Poetry listening on port ${port}`));
}
