/* Builds the engine snapshot from both venues' live APIs. */
const HL = require('./venues/hyperliquid');
const LT = require('./venues/lighter');
const MARKETS = require('./markets');
const H = 3600e3;
const HIST_HOURS = 720;

/* Put hourly rows on a fixed grid of `hours` hours ending at `endHour` (exclusive).
   Missing hours repeat the previous rate; leading gaps take the first known rate. Returns null if no data. */
function alignHourly(rows, endHour, hours) {
  if (!rows.length) return null;
  const byHour = new Map(rows.map(r => [Math.floor(r.t / H) * H, r.rate]));
  const out = new Array(hours); let last = null, missing = 0;
  for (let i = 0; i < hours; i++) {
    const t = endHour - (hours - i) * H;
    if (byHour.has(t)) last = byHour.get(t); else missing++;
    out[i] = last;
  }
  const first = out.find(x => x != null);
  for (let i = 0; i < hours && out[i] == null; i++) out[i] = first;
  return { series: out, missing };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function build(opts = {}) {
  const now = opts.now || Date.now(), log = opts.log || (() => {});
  const api = { hl: opts.hl || HL, lt: opts.lt || LT };
  const [hlM, ltM, rates] = await Promise.all([
    api.hl.markets().catch(e => { log('Hyperliquid markets failed: ' + e.message); return {}; }),
    api.lt.markets().catch(e => { log('Lighter markets failed: ' + e.message); return {}; }),
    api.lt.currentRates().catch(e => { log('Lighter funding-rates failed: ' + e.message); return { lighter: {}, hyperliquid: {} }; })
  ]);
  const endHour = Math.floor(now / H) * H, notes = [];
  const rows = await pool(MARKETS, 4, async m => {
    const h = hlM[m.hl], l = ltM[m.lt];
    const [hh, lh] = await Promise.all([
      h ? api.hl.fundingHistory(m.hl, HIST_HOURS, now).catch(e => { notes.push(`${m.sym} HL history: ${e.message}`); return []; }) : [],
      l ? api.lt.fundingHistory(l.id, HIST_HOURS, now).catch(e => { notes.push(`${m.sym} Lighter history: ${e.message}`); return []; }) : []
    ]);
    return { m, h, l, hh: alignHourly(hh, endHour, HIST_HOURS), lh: alignHourly(lh, endHour, HIST_HOURS) };
  });
  const markets = [], hist = {}, histHL = {};
  rows.forEach(({ m, h, l, hh, lh }) => {
    if (!lh && !hh) { notes.push(`${m.sym}: no funding history from either venue, skipped`); return; }
    const ltSeries = lh ? lh.series : hh.series;   // the engine needs one base series per market
    hist[m.sym] = ltSeries;
    if (hh) histHL[m.sym] = hh.series;
    const px = (h && h.px) || (l && l.px);
    if (!px) { notes.push(`${m.sym}: no price, skipped`); delete hist[m.sym]; delete histHL[m.sym]; return; }
    markets.push({
      sym: m.sym, name: m.name, px, dailyVol: m.dailyVol, halfSpreadBps: m.halfSpreadBps,
      hl: h ? { maxLev: h.maxLev, volume24h: h.volume24h || 1, r0: h.r0 } : { maxLev: 0, volume24h: 1, r0: 0 },
      lt: l ? { maxLev: l.maxLev, mmr: l.mmr, cmr: l.cmr, volume24h: l.volume24h || 1, r0: rates.lighter[m.lt] != null ? rates.lighter[m.lt] : ltSeries[ltSeries.length - 1] }
            : { maxLev: 0, mmr: 0.05, cmr: 0.03, volume24h: 1, r0: 0 }
    });
    if (lh && lh.missing > 24) notes.push(`${m.sym} Lighter history missing ${lh.missing}h`);
    if (hh && hh.missing > 24) notes.push(`${m.sym} HL history missing ${hh.missing}h`);
  });
  return { asOf: new Date(endHour).toISOString(), histStart: (endHour - HIST_HOURS * H) / 1000, hlScale: 1, markets, hist, histHL, notes };
}

/* The web page embeds history as integers (fraction x 1e6) to stay small. */
function forWeb(snap) {
  const enc = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(x => Math.round(x * 1e6))]));
  return { asOf: snap.asOf, histStart: snap.histStart, histUnit: 1e-6, hlScale: snap.hlScale, markets: snap.markets, histRaw: enc(snap.hist), histHLRaw: enc(snap.histHL || {}) };
}

module.exports = { build, alignHourly, forWeb, HIST_HOURS };
