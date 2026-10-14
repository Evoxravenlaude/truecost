/* Builds the self-contained web page (engine + snapshot + backtest inlined) from a web-format snapshot. */
const fs = require('fs');
const path = require('path');
const TrueCost = require('./engine');

const ROOT = path.join(__dirname, '..');
const decode = web => {
  const dec = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v.map(x => x * web.histUnit)]));
  return Object.assign({}, web, { hist: dec(web.histRaw), histHL: dec(web.histHLRaw) });
};
const sample = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'snapshot.sample.json'), 'utf8'));

function build(web) {
  const snap = decode(web), E = TrueCost.create(snap), rows = E.backtest();
  const idx = Object.fromEntries(snap.markets.map((m, i) => [m.sym, i])), r6 = x => Math.round(x * 1e6);
  const bt = rows.map(r => [idx[r.sym], r.H, r.t0, r6(r.p10), r6(r.p50), r6(r.p90), r6(r.real)]);
  const html = fs.readFileSync(path.join(ROOT, 'web', 'page.html'), 'utf8')
    .replace('/*ENGINE*/', () => fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8'))
    .replace('/*SNAP*/', () => JSON.stringify(web))
    .replace('/*BT*/', () => JSON.stringify(bt));
  return { html, forecasts: rows.length };
}

/* The page is written as a fragment (it's also published as an artifact); wrap it into a full document for hosting. */
function documentFor(fragment, opts = {}) {
  const live = opts.live ? `<script>window.TC_LIVE=${JSON.stringify({ bot: opts.bot || null })};</script><script src="https://telegram.org/js/telegram-web-app.js" async></script>` : '';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="description" content="What a perp trade on Hyperliquid or Lighter really costs, before you place it.">'
    + '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style></head><body>'
    + live + fragment + '</body></html>';
}

module.exports = { build, documentFor, decode, sample };
