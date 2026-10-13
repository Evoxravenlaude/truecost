/* Walk-forward backtest of the funding forecast on the loaded snapshot's Lighter history. */
const TrueCost = require('../src/engine'), load = require('./load-web-snapshot');
const { file, snap } = load(), E = TrueCost.create(snap), rows = E.backtest();
console.log(`snapshot ${file}\n${rows.length} forecasts`);
for (const H of [24, 72, 168]) { const r = rows.filter(x => x.H === H); if (r.length) console.log(`${H}h: 80% range held ${(100 * r.filter(x => x.hit).length / r.length).toFixed(1)}% of ${r.length}`); }
module.exports = rows;
