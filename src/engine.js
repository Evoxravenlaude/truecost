/* TrueCost engine v2. Pure functions, no I/O. Works in the browser (global TrueCost) and in Node (require).
   Units: funding rates are hourly fractions (0.000012 = 0.0012% per hour). Positive = longs pay shorts. */
(function (root) {
  const VENUES = {
    hl: { id: 'hl', name: 'Hyperliquid', short: 'HL' },
    lt: { id: 'lt', name: 'Lighter', short: 'LT' }
  };
  const FEES = {
    hl: { base: { taker: 0.00045, maker: 0.00015, label: 'base tier' } },
    lt: { standard: { taker: 0, maker: 0, label: 'Standard account' }, premium: { taker: 0.00028, maker: 0.00004, label: 'Premium, no LIT staked' } }
  };
  let TAU_H = 6;            // hours for the current rate to fade into the historical pattern
  let POOL_W = 0.5;          // share of paths drawn from other markets' history
  let BLOCK_H = 24;         // minimum bootstrap block length
  const TRAIN_MAX_H = 720;  // use at most the last 30 days
  const TRAIN_MIN_H = 336;  // need at least 14 days before forecasting
  const IMPACT_Y = 0.5;     // square-root impact coefficient

  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function quantile(sorted, p) { const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }

  /* Funding forecast: block bootstrap over the venue's own recent hourly history,
     starting from the current rate and fading into resampled history.
     hist: hourly fractions, oldest first. end: index one past the last hour the forecast may see.
     Returns cumulative funding (fraction of notional, longs' perspective) per path, sorted. */
  function forecastPaths(hist, end, r0, hours, opt) {
    opt = opt || {};
    const n = opt.paths || 1000, scale = opt.scale || 1, poolW = opt.pool && opt.pool.length ? (opt.poolWeight != null ? opt.poolWeight : POOL_W) : 0;
    const start = Math.max(0, end - TRAIN_MAX_H);
    const own = hist.slice(start, end), pool = (opt.pool || []).map(h => h.slice(start, end));
    if (own.length < BLOCK_H) throw new Error('not enough history');
    const rand = rng(opt.seed != null ? opt.seed : hash([end, r0, hours, own.length].join('|')));
    const B = Math.min(own.length, Math.max(BLOCK_H, hours)), out = new Float64Array(n);
    for (let p = 0; p < n; p++) {
      // Most paths replay this market's own history; a share replay another market's
      // history over the same dates, so regimes this market has not had yet still show up.
      const src = poolW && rand() < poolW ? pool[Math.floor(rand() * pool.length)] : own;
      let sum = 0, k = 0;
      while (k < hours) {
        const s = Math.floor(rand() * (src.length - B + 1));
        for (let j = 0; j < B && k < hours; j++, k++) {
          const w = Math.exp(-k / TAU_H);
          sum += w * r0 + (1 - w) * src[s + j] * scale;
        }
      }
      out[p] = sum;
    }
    out.sort();
    return out;
  }
  /* Summarise paths for one side and size. Positive $ = you pay. */
  function summarise(paths, side, notional) {
    const k = side * notional, a = quantile(paths, 0.1) * k, c = quantile(paths, 0.9) * k;
    let fav = 0; for (let i = 0; i < paths.length; i++) if (paths[i] * side < 0) fav++;
    return { p10: Math.min(a, c), median: quantile(paths, 0.5) * k, p90: Math.max(a, c), pReceive: fav / paths.length };
  }

  /* Isolated liquidation price (Hyperliquid's documented formula; Lighter's partial-liquidation
     trigger reduces to the same expression with its maintenance fraction). */
  function liqPrice(entry, side, size, margin, mmr) {
    return entry - side * (margin - mmr * size * entry) / size / (1 - mmr * side);
  }
  function mmrOf(m, v) { return v === 'hl' ? 1 / (2 * m.hl.maxLev) : m.lt.mmr; }
  /* Half-spread plus square-root market impact against the venue's 24h volume. */
  function slippageBps(m, v, notional) {
    return m.halfSpreadBps + IMPACT_Y * m.dailyVol * Math.sqrt(notional / m[v].volume24h) * 1e4;
  }

  function create(snapshot) {
    const S = snapshot, bySym = {};
    S.markets.forEach(m => { bySym[m.sym.toLowerCase()] = m; });
    const market = s => bySym[String(s).toLowerCase()] || null;
    const cache = new Map();
    let NP = 1000; // simulated paths per forecast; the page lets people trade speed for detail
    // Hyperliquid paths use Hyperliquid's own history when the snapshot has it (the live service does);
    // otherwise they borrow Lighter's pattern for the same market, rescaled to Hyperliquid's base rate.
    const hasHL = sym => !!(S.histHL && S.histHL[sym] && S.histHL[sym].length >= BLOCK_H);
    const histFor = (sym, v) => v === 'hl' && hasHL(sym) ? S.histHL[sym] : S.hist[sym];
    const poolFor = (sym, v) => S.markets.filter(x => x.sym !== sym).map(x => histFor(x.sym, v));

    function paths(sym, v, hours) {
      const key = sym + v + hours + '|' + NP;
      if (cache.has(key)) return cache.get(key);
      const m = market(sym), h = histFor(m.sym, v), borrowed = v === 'hl' && !hasHL(m.sym);
      const p = forecastPaths(h, h.length, m[v].r0, hours, { scale: borrowed ? (S.hlScale || 1) : 1, seed: hash(key), pool: poolFor(m.sym, v), paths: NP });
      if (cache.size > 300) cache.clear();
      cache.set(key, p);
      return p;
    }
    function funding(sym, v, side, notional, hours) { return summarise(paths(sym, v, hours), side, notional); }

    function quote(inp, v) {
      const m = market(inp.sym), side = inp.side === 'short' ? -1 : 1, maxLev = m[v].maxLev;
      if (inp.lev > maxLev) return { v, ok: false, maxLev };
      const fr = v === 'hl' ? FEES.hl.base : FEES.lt[inp.acct === 'premium' ? 'premium' : 'standard'];
      const N = inp.notional, maker = inp.order === 'maker', rate = maker ? fr.maker : fr.taker;
      const sBps = slippageBps(m, v, N);
      const entryFee = N * rate, slip = maker ? 0 : N * sBps / 1e4;
      const exit = N * fr.taker + N * sBps / 1e4;
      const f = funding(m.sym, v, side, N, inp.hours);
      const size = N / m.px, margin = N / inp.lev, mmr = mmrOf(m, v);
      const liq = liqPrice(m.px, side, size, margin, mmr);
      const liqStress = liqPrice(m.px, side, size, margin - Math.max(0, f.p90), mmr);
      const total = entryFee + slip + exit + f.median;
      return {
        v, ok: true, side, px: m.px, maxLev, rate, feeLabel: fr.label, entryFee, slip, slipBps: maker ? 0 : sBps,
        entry: entryFee + slip, exit, f, size, margin, mmr, maint: mmr * N, buffer: margin - mmr * N,
        liq, dist: Math.abs(liq - m.px) / m.px, liqStress, distStress: Math.abs(liqStress - m.px) / m.px,
        total, breakeven: total / N, r0: m[v].r0, take: 0
      };
    }
    function compare(inp) { return { hl: quote(inp, 'hl'), lt: quote(inp, 'lt') }; }

    /* Walk-forward backtest on Lighter's real history. Each forecast sees only hours before t0. */
    function backtest(holds, step) {
      holds = holds || [24, 72, 168]; step = step || 24;
      const rows = [];
      S.markets.forEach(m => {
        const h = S.hist[m.sym];
        holds.forEach(H => {
          for (let t0 = TRAIN_MIN_H; t0 + H <= h.length; t0 += step) {
            const p = forecastPaths(h, t0, h[t0 - 1], H, { paths: 600, seed: hash(m.sym + t0 + '|' + H), pool: poolFor(m.sym, 'lt') });
            let real = 0; for (let i = t0; i < t0 + H; i++) real += h[i];
            const lo = quantile(p, 0.1), mid = quantile(p, 0.5), hi = quantile(p, 0.9);
            rows.push({ sym: m.sym, H, t0, ts: S.histStart + t0 * 3600, p10: lo, p50: mid, p90: hi, real, hit: real >= lo && real <= hi });
          }
        });
      });
      return rows;
    }

    function parseCost(text) {
      const r = /^\/cost\s+(\S+)\s+(long|short)\s+\$?([\d.]+)\s*([km]?)\s+(\d+)x\s+(\d+)\s*([hd])\s*$/i.exec(String(text).trim());
      if (!r) return { error: 'Try it like this: /cost ETH long 25k 5x 3d\n(market, long or short, position size, leverage, how long you hold)' };
      const m = market(r[1]);
      if (!m) return { error: 'I don\'t cover ' + r[1].toUpperCase() + ' yet. Markets: ' + S.markets.map(x => x.sym).join(', ') };
      const notional = parseFloat(r[3]) * ({ k: 1e3, m: 1e6 }[r[4].toLowerCase()] || 1);
      const hours = parseInt(r[6], 10) * (r[7].toLowerCase() === 'd' ? 24 : 1);
      if (!(notional >= 100)) return { error: 'Position size must be at least $100.' };
      if (hours < 1 || hours > 336) return { error: 'Hold time must be between 1h and 14d.' };
      return { sym: m.sym, side: r[2].toLowerCase(), notional, lev: parseInt(r[5], 10), hours, order: 'taker', acct: 'standard' };
    }

    /* Monitor: state of an open position at a given mark price, plus alerts. */
    function position(p, mark) {
      const m = market(p.sym), side = p.side === 'short' ? -1 : 1, size = p.notional / p.entry, margin = p.notional / p.lev;
      const liq = p.liq != null ? p.liq : liqPrice(p.entry, side, size, margin, mmrOf(m, p.v));
      const dist = side * (mark - liq) / mark;
      const f24 = funding(m.sym, p.v, side, size * mark, 24), f7 = funding(m.sym, p.v, side, size * mark, 168);
      const paying = m[p.v].r0 * side >= 0;
      return { ...p, sideN: side, mark, liq, dist, pnl: side * (mark - p.entry) * size, f24, f7, paying,
        pFlip: paying ? f24.pReceive : 1 - f24.pReceive, carry: f7.median / p.notional };
    }
    function alerts(ps, thr) {
      const out = [];
      ps.forEach(p => {
        const n = `${p.sym} ${p.side} on ${VENUES[p.v].name}`;
        if (p.dist <= 0) out.push({ level: 'critical', pos: p, text: `${n}: price is past your liquidation level. The position would be closing now.` });
        else if (p.dist < thr) out.push({ level: p.dist < thr / 2 ? 'critical' : 'warning', pos: p, kind: 'room', text: `${n}: liquidation is ${(p.dist * 100).toFixed(1)}% away. Adding about $${Math.round(p.notional * (thr - p.dist)).toLocaleString('en-US')} of margin would move it back to ${(thr * 100).toFixed(0)}%.` });
        if (p.dist > 0 && p.pFlip > 0.3) out.push({ level: 'info', pos: p, kind: 'flip', text: `${n}: ${Math.round(p.pFlip * 100)}% chance the holding fee changes direction in the next 24 hours. Right now you ${p.paying ? 'pay' : 'get paid'}.` });
        if (p.dist > 0 && p.carry > 0.004) out.push({ level: 'info', pos: p, kind: 'carry', text: `${n}: holding fees are running at about ${(p.carry * 100).toFixed(2)}% of the position per week.` });
      });
      return out;
    }

    function setPaths(n) { NP = Math.max(100, Math.min(5000, n | 0)); cache.clear(); }
    return { snapshot: S, setPaths, pathsCount: () => NP, hasHLHistory: hasHL, VENUES, FEES, market, funding, quote, compare, backtest, parseCost, position, alerts, liqPrice, mmrOf };
  }

  const api = { set(k, v) { if (k === 'TAU_H') TAU_H = v; if (k === 'BLOCK_H') BLOCK_H = v; if (k === 'POOL_W') POOL_W = v; }, create, forecastPaths, summarise, liqPrice, quantile, VENUES, FEES, TAU_H, BLOCK_H, TRAIN_MAX_H, TRAIN_MIN_H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrueCost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
