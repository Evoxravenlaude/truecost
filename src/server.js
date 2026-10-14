/* Small HTTP server: the live web page, a health check and two JSON feeds. No framework needed. */
const http = require('http');

function createServer(state) {
  // state: { html(), health(), snapshot(), accuracy(), positions(wallet, ip) -> Promise<{code, body}> }
  return http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const send = (code, type, body, extra) => { res.writeHead(code, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }, extra)); res.end(req.method === 'HEAD' ? undefined : body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' });
    try {
      if (url === '/' || url === '/index.html') return send(200, 'text/html; charset=utf-8', state.html());
      if (url === '/health') return send(200, 'application/json', JSON.stringify(state.health()));
      if (url === '/api/snapshot') { const s = state.snapshot(); return s ? send(200, 'application/json', JSON.stringify(s), { 'Access-Control-Allow-Origin': '*' }) : send(503, 'application/json', '{"error":"loading"}'); }
      if (url === '/api/accuracy') return send(200, 'application/json', JSON.stringify(state.accuracy()), { 'Access-Control-Allow-Origin': '*' });
      if (url === '/api/positions' && state.positions) {
        const wallet = new URL(req.url, 'http://x').searchParams.get('wallet'), ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
        state.positions(wallet, ip).then(r => send(r.code, 'application/json', JSON.stringify(r.body)), () => send(502, 'application/json', '{"error":"Could not reach the exchanges. Try again shortly."}'));
        return;
      }
      if (url === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nAllow: /\n');
      return send(404, 'text/plain', 'Not found');
    } catch (e) { return send(500, 'text/plain', 'Server error'); }
  });
}
module.exports = { createServer };
