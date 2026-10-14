const test = require('node:test');
const assert = require('node:assert');
const WebPage = require('../src/webpage');
const { createServer } = require('../src/server');

test('page builds from the bundled snapshot and wraps into a live document', () => {
  const { html, forecasts } = WebPage.build(WebPage.sample());
  assert.ok(forecasts > 500);
  assert.ok(!html.includes('/*ENGINE*/') && !html.includes('/*SNAP*/') && !html.includes('/*BT*/'));
  const doc = WebPage.documentFor(html, { live: true, bot: 'TrueCostBot' });
  assert.match(doc, /^<!doctype html>/); assert.match(doc, /window\.TC_LIVE=\{"bot":"TrueCostBot"\}/);
  assert.ok(!WebPage.documentFor(html).includes('window.TC_LIVE='));
});

test('server routes', async () => {
  const srv = createServer({
    html: () => '<p>page</p>', health: () => ({ ok: true }), snapshot: () => null, accuracy: () => ({ n: 0 }),
    positions: async (w, ip) => w === 'bad' ? { code: 400, body: { error: 'nope' } } : { code: 200, body: { positions: [], ip } }
  });
  await new Promise(r => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`, get = p => fetch(base + p);
  try {
    let r = await get('/'); assert.strictEqual(r.status, 200); assert.strictEqual(await r.text(), '<p>page</p>');
    r = await get('/health'); assert.deepStrictEqual(await r.json(), { ok: true });
    r = await get('/api/snapshot'); assert.strictEqual(r.status, 503);
    r = await get('/api/accuracy'); assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
    r = await get('/api/positions?wallet=bad'); assert.strictEqual(r.status, 400);
    r = await get('/api/positions?wallet=0xabc'); assert.strictEqual(r.status, 200); assert.ok('ip' in await r.json());
    r = await get('/nope'); assert.strictEqual(r.status, 404);
    r = await fetch(base + '/', { method: 'POST' }); assert.strictEqual(r.status, 405);
  } finally { srv.close(); }
});
