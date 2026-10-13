/* Reads a user's wallets, turns venue positions into engine positions, and decides which alerts to send. */
const HL = require('./venues/hyperliquid');
const LT = require('./venues/lighter');
const MARKETS = require('./markets');
const REPEAT_MS = { critical: 2 * 3600e3, warning: 6 * 3600e3, info: 24 * 3600e3 };

const symFor = (venue, coin) => { const m = MARKETS.find(x => x[venue] === coin); return m ? m.sym : null; };

async function fetchPositions(wallets, api = { hl: HL, lt: LT }) {
  const all = [], errors = [];
  for (const w of wallets) {
    const [a, b] = await Promise.all([
      api.hl.positions(w).catch(e => { errors.push(`Hyperliquid: ${e.message}`); return []; }),
      api.lt.positions(w).catch(e => { errors.push(`Lighter: ${e.message}`); return []; })
    ]);
    all.push(...a, ...b);
  }
  return { raw: all, errors };
}

/* Venue positions -> engine positions at the current mark. Uses the venue's own liquidation price when it gives one. */
function evaluate(E, raw) {
  const ps = [], skipped = [];
  raw.forEach(r => {
    const sym = symFor(r.venue, r.coin), m = sym && E.market(sym);
    if (!m) { skipped.push(`${r.coin} (${r.venue === 'hl' ? 'HL' : 'LT'})`); return; }
    const lev = r.lev || Math.max(1, Math.round(r.notional / (r.margin || r.notional)));
    ps.push(Object.assign(E.position({ sym, v: r.venue, side: r.side, entry: r.entry, notional: r.notional, lev, liq: r.liq }, m.px), { mode: r.mode }));
  });
  return { ps, skipped };
}

/* Keep only alerts not already sent recently. `sent` maps alert key -> last sent ms and is updated in place. */
function dedupe(alerts, ps, sent, now = Date.now()) {
  const out = [];
  alerts.forEach(a => {
    const key = a.level + '|' + a.text.split(':')[0];
    if (sent[key] && now - sent[key] < REPEAT_MS[a.level]) return;
    sent[key] = now; out.push(a);
  });
  Object.keys(sent).forEach(k => { if (now - sent[k] > 7 * 24 * 3600e3) delete sent[k]; });
  return out;
}

module.exports = { fetchPositions, evaluate, dedupe, symFor };
