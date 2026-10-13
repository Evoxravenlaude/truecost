/* Lighter public REST API. Docs: apidocs.lighter.xyz
   Units observed on mainnet (not stated in the docs, checked against payments):
   - /fundings `rate` is a percent per hour, unsigned; `direction` "long" = longs pay, "short" = shorts pay.
   - /funding-rates `rate` is an 8-hour fraction.
   - margin fractions in /orderBookDetails are in units of 0.01% (200 = 2%). */
const { getJSON } = require('../http');
const BASE = process.env.LIGHTER_URL || 'https://mainnet.zklighter.elliot.ai';

/* -> { [symbol]: { id, px, maxLev, mmr, cmr, volume24h } } */
function parseOrderBookDetails(json) {
  const out = {};
  (json.order_book_details || []).forEach(d => {
    const imf = +d.min_initial_margin_fraction / 1e4;
    out[d.symbol] = {
      id: +d.market_id, px: +(d.mark_price || d.last_trade_price), maxLev: imf > 0 ? Math.floor(1 / imf + 1e-9) : null,
      mmr: +d.maintenance_margin_fraction / 1e4, cmr: +d.closeout_margin_fraction / 1e4, volume24h: +d.daily_quote_token_volume
    };
  });
  return out;
}
async function markets(get = getJSON) { return parseOrderBookDetails(await get(`${BASE}/api/v1/orderBookDetails?filter=perp`)); }

/* Current rates. -> { lighter: {symbol: hourlyFraction}, hyperliquid: {symbol: hourlyFraction} } */
function parseFundingRates(json) {
  const out = { lighter: {}, hyperliquid: {} };
  (json.funding_rates || []).forEach(r => { if (out[r.exchange]) out[r.exchange][r.symbol] = +r.rate / 8; });
  return out;
}
async function currentRates(get = getJSON) { return parseFundingRates(await get(`${BASE}/api/v1/funding-rates`)); }

function parseFundings(json) {
  return (json.fundings || []).map(f => ({ t: +f.timestamp * (f.timestamp < 1e12 ? 1000 : 1), rate: (+f.rate / 100) * (f.direction === 'short' ? -1 : 1) }));
}
/* Hourly funding for the last `hours` hours, in 500-hour windows. -> [{ t: ms, rate }] oldest first. */
async function fundingHistory(marketId, hours, now = Date.now(), get = getJSON) {
  const end = Math.floor(now / 1000), rows = new Map();
  for (let s = end - hours * 3600; s < end; s += 500 * 3600) {
    const e = Math.min(end, s + 500 * 3600);
    const json = await get(`${BASE}/api/v1/fundings?market_id=${marketId}&resolution=1h&start_timestamp=${s}&end_timestamp=${e}&count_back=0`);
    parseFundings(json).forEach(r => rows.set(r.t, r));
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

/* Open positions for an L1 wallet across its Lighter accounts. */
function parsePositions(json) {
  const out = [];
  (json.accounts || []).forEach(acc => (acc.positions || []).forEach(p => {
    const size = Math.abs(+p.position); if (!size) return;
    const entry = +p.avg_entry_price, imf = +p.initial_margin_fraction, liq = +p.liquidation_price;
    out.push({
      venue: 'lt', coin: p.symbol, side: +p.sign < 0 ? 'short' : 'long', size, entry, notional: size * entry,
      margin: +p.allocated_margin || null, lev: imf > 0 ? Math.round(100 / imf) : null, liq: liq > 0 ? liq : null,
      mode: +p.margin_mode === 1 ? 'isolated' : 'cross', account: acc.index != null ? acc.index : acc.account_index
    });
  }));
  return out;
}
async function positions(address, get = getJSON) { return parsePositions(await get(`${BASE}/api/v1/account?by=l1_address&value=${encodeURIComponent(address)}`)); }

module.exports = { markets, currentRates, fundingHistory, positions, parseOrderBookDetails, parseFundingRates, parseFundings, parsePositions };
