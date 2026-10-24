import test from 'node:test';
import assert from 'node:assert/strict';
import {workshopServer} from '../server.mjs';

async function serverFor(t, options) {
  const server = workshopServer({
    apiOrigin:'https://data-scrap-poetry.amazingsriracha.chatgpt.site',
    externalOrigin:null,
    ...options,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  return `http://127.0.0.1:${server.address().port}`;
}
test('both pages and their modules are served; nonpublic files are not', async t => {
  const base = await serverFor(t);
  for (const path of ['/','/workshop','/space?gallery=existing','/facilitator?room=8212026','/client/facilitator.js','/client/space/screenshot.js','/vendor/html-to-image.js']) assert.equal((await fetch(base+path)).status, 200, path);
  for (const path of ['/server.mjs','/package.json','/.env','/%2e%2e%2fserver.mjs']) assert.equal((await fetch(base+path)).status, 404, path);
});
test('participant auth, request and response survive the fixed backend proxy', async t => {
  const base = await serverFor(t, {fetcher:async (url, options) => {
    assert.equal(url, 'https://data-scrap-poetry.amazingsriracha.chatgpt.site/api/rooms/TEST12/actions');
    assert.equal(options.headers.Authorization, 'Bearer participant-token');
    assert.equal(options.headers.Origin, 'https://data-scrap-poetry.amazingsriracha.chatgpt.site');
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.body.toString(), '{"type":"share"}');
    return Response.json({saved:true}, {status:201});
  }});
  const result = await fetch(base+'/api/rooms/TEST12/actions', {method:'POST',headers:{Origin:base,Authorization:'Bearer participant-token',Cookie:'private=not-forwarded'},body:'{"type":"share"}'});
  assert.equal(result.status, 201); assert.deepEqual(await result.json(), {saved:true});
});
test('cross-origin, oversized and unsupported mutations never reach the backend', async t => {
  const base = await serverFor(t, {fetcher:() => {throw Error('Must not be called');}});
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://unrelated.example'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',body:'x'.repeat(2000001)})).status,413);
  assert.equal((await fetch(base+'/api/rooms',{method:'DELETE'})).status,405);
});
test('backend failures are recoverable and do not expose an upstream login page', async t => {
  const base = await serverFor(t, {fetcher:async () => new Response('<html>Sign in</html>')});
  const result = await fetch(base+'/api/rooms/TEST12');
  assert.equal(result.status,502); assert.match((await result.json()).error,/retry/);
  assert.equal((await fetch(base+'/healthz')).status,200);
});
test('deployed requests accept the Render origin and reject local or foreign origins', async t => {
  let calls = 0;
  const origin = 'https://datascrappoetry.onrender.com';
  const base = await serverFor(t, {externalOrigin:origin, fetcher:async () => {
    calls++; return Response.json({ok:true});
  }});
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:origin},body:'{}'})).status,200);
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:base},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://foreign.example'},body:'{}'})).status,403);
  assert.equal(calls,1);
});
