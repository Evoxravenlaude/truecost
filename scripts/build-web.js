/* Builds dist/truecost.html: the web page with the engine, the latest snapshot and its backtest inlined. */
const fs = require('fs'), path = require('path');
const TrueCost = require('../src/engine'), load = require('./load-web-snapshot');
const { file, web, snap } = load(), E = TrueCost.create(snap), rows = E.backtest();
const idx = Object.fromEntries(snap.markets.map((m, i) => [m.sym, i])), r6 = x => Math.round(x * 1e6);
const bt = rows.map(r => [idx[r.sym], r.H, r.t0, r6(r.p10), r6(r.p50), r6(r.p90), r6(r.real)]);
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'web', 'page.html'), 'utf8');
html = html.replace('/*ENGINE*/', () => fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8'))
  .replace('/*SNAP*/', () => JSON.stringify(web)).replace('/*BT*/', () => JSON.stringify(bt));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'truecost.html'), html);
console.log(`built dist/truecost.html from ${path.relative(root, file)} (${rows.length} backtest forecasts, ${(html.length / 1024).toFixed(0)} KB)`);
