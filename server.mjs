import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const defaultApi = 'https://data-scrap-poetry.super-giant-1444.chatgpt.site';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const maxBody = 2000000;
function json(res, status, value) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value));}

export function workshopServer({apiOrigin=process.env.WORKSHOP_API_ORIGIN || defaultApi, externalOrigin=process.env.RENDER_EXTERNAL_URL, fetcher=fetch} = {}) {
  const upstream = new URL(apiOrigin);
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw new Error('WORKSHOP_API_ORIGIN must be an https origin.');
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') return json(res, 200, {ok:true});
      if (url.pathname.startsWith('/api/')) {
        if (!['GET','POST'].includes(req.method)) return json(res, 405, {error:'Method not allowed.'});
        // Requests still carry the participant's own bearer token. No admin
        // credential is stored in this gateway and cookies are not forwarded.
        const origin = req.headers.origin;
        const allowed = externalOrigin ? new URL(externalOrigin).origin : `http://${req.headers.host}`;
        if (origin && origin !== allowed) return json(res, 403, {error:'Invalid origin.'});
        if (Number(req.headers['content-length'] || 0) > maxBody) return json(res, 413, {error:'Request too large.'});
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > maxBody) return json(res, 413, {error:'Request too large.'});
          chunks.push(chunk);
        }
        const headers = {Accept:'application/json', Origin:upstream.origin};
        if (req.headers.authorization) headers.Authorization = req.headers.authorization;
        if (req.method === 'POST') headers['Content-Type'] = 'application/json';
        const response = await fetcher(`${upstream.origin}${url.pathname}${url.search}`, {
          method:req.method, headers, body:req.method === 'POST' ? Buffer.concat(chunks) : undefined,
          redirect:'error', signal:AbortSignal.timeout(30000),
        });
        if (!response.headers.get('content-type')?.includes('application/json')) return json(res, 502, {error:'Workshop server unavailable. Please retry.'});
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
    } catch {
      if (!res.headersSent) json(res, 502, {error:'Workshop server unavailable. Please retry.'});
      else res.destroy();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 10000);
  workshopServer().listen(port, '0.0.0.0', () => console.log(`Data-Scrap-Poetry listening on port ${port}`));
}
