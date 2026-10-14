/* Pulls live data from both venues once, prints what loaded, and writes data/snapshot.web.json. */
require('../src/env');
const fs = require('fs'), path = require('path');
const Snapshot = require('../src/snapshot'), TrueCost = require('../src/engine');
(async () => {
  const s = await Snapshot.build({ log: console.log });
  console.log(`as of ${s.asOf}: ${s.markets.length} markets`);
  s.markets.forEach(m => console.log(`${m.sym.padEnd(9)} px ${m.px}  HL max ${m.hl.maxLev}x r ${(m.hl.r0 * 100).toFixed(5)}%/h  LT max ${m.lt.maxLev}x mmr ${m.lt.mmr} r ${(m.lt.r0 * 100).toFixed(5)}%/h  hist HL ${s.histHL[m.sym] ? 'yes' : 'no'}`));
  s.notes.forEach(n => console.log('note:', n));
  if (!s.markets.length) { console.error('No markets loaded. Check this machine can reach api.hyperliquid.xyz and mainnet.zklighter.elliot.ai.'); process.exit(1); }
  const E = TrueCost.create(s), probe = s.markets[0].sym, c = E.compare({ sym: probe, side: 'long', notional: 25000, lev: 5, hours: 72, order: 'taker', acct: 'standard' });
  console.log(`${probe} 25k 5x 3d:`, ['hl', 'lt'].map(v => c[v].ok ? `${v} total $${c[v].total.toFixed(2)} liq ${c[v].liq.toFixed(2)}` : `${v} n/a`).join(' | '));
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'snapshot.web.json'), JSON.stringify(Snapshot.forWeb(s)));
  console.log('wrote', path.join(dir, 'snapshot.web.json'));
})().catch(e => { console.error('failed:', e.message); process.exit(1); });
