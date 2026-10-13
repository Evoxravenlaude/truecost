/* Hyperliquid public info API. Docs: hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
   Funding values from the API are hourly fractions. */
const { postJSON } = require('../http');
const URL = process.env.HL_INFO_URL || 'https://api.hyperliquid.xyz/info';
const H = 3600e3;

/* -> { [coin]: { px, maxLev, r0, volume24h } } */
function parseMetaAndCtxs(json) {
  const [meta, ctxs] = json, out = {};
  meta.universe.forEach((u, i) => {
    const c = ctxs[i]; if (!c) return;
    out[u.name] = { px: +(c.markPx || c.midPx || c.oraclePx), maxLev: +u.maxLeverage, r0: +c.funding, volume24h: +c.dayNtlVlm };
  });
  return out;
}
async function markets(post = postJSON) { return parseMetaAndCtxs(await post(URL, { type: 'metaAndAssetCtxs' })); }

/* Hourly funding for the last `hours` hours. -> [{ t: ms, rate }] oldest first. Pages 500 at a time. */
async function fundingHistory(coin, hours, now = Date.now(), post = postJSON) {
  let start = now - hours * H; const rows = [];
  for (let guard = 0; guard < 20; guard++) {
    const page = await post(URL, { type: 'fundingHistory', coin, startTime: start, endTime: now });
    if (!Array.isArray(page) || !page.length) break;
    page.forEach(r => rows.push({ t: +r.time, rate: +r.fundingRate }));
    const last = +page[page.length - 1].time;
    if (page.length < 500 || last >= now) break;
    start = last + 1;
  }
  return rows;
}

/* Open positions for a wallet. -> [{ venue, coin, side, size, entry, notional, margin, lev, liq, mode }] */
function parsePositions(json) {
  return (json.assetPositions || []).map(a => a.position).filter(p => p && +p.szi !== 0).map(p => {
    const size = Math.abs(+p.szi), entry = +p.entryPx;
    return {
      venue: 'hl', coin: p.coin, side: +p.szi > 0 ? 'long' : 'short', size, entry, notional: size * entry,
      margin: +p.marginUsed, lev: p.leverage ? +p.leverage.value : null,
      liq: p.liquidationPx == null ? null : +p.liquidationPx, mode: p.leverage ? p.leverage.type : null
    };
  });
}
async function positions(address, post = postJSON) { return parsePositions(await post(URL, { type: 'clearinghouseState', user: address })); }

module.exports = { markets, fundingHistory, positions, parseMetaAndCtxs, parsePositions };
