const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const TrueCost = require('../src/engine');
const HL = require('../src/venues/hyperliquid');
const LT = require('../src/venues/lighter');
const Snapshot = require('../src/snapshot');
const Store = require('../src/store');
const { Calibration, dailyForecasts, realized } = require('../src/calibration');
const { evaluate, dedupe } = require('../src/monitor');
const MARKETS = require('../src/markets');

const H = 3600e3, NOW = Date.UTC(2026, 9, 13, 9, 30);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`);

/* ---------- fixtures in the documented response shapes ---------- */
const hlMeta = [
  { universe: MARKETS.map(m => ({ name: m.hl, szDecimals: 2, maxLeverage: m.sym === 'BTC' ? 40 : m.sym === 'ETH' ? 25 : 10 })) },
  MARKETS.map(m => ({ dayNtlVlm: '50000000.0', funding: '0.0000125', markPx: m.sym === 'ETH' ? '2500.0' : '100.0', midPx: '100.0', oraclePx: '100.0', openInterest: '1', premium: '0', prevDayPx: '100', impactPxs: ['99.9', '100.1'] }))
];
const ltDetails = { code: 200, order_book_details: MARKETS.map((m, i) => ({ symbol: m.lt, market_id: i, status: 'active', last_trade_price: m.sym === 'ETH' ? 2499 : 99.9, mark_price: m.sym === 'ETH' ? '2500.5' : '100.0', min_initial_margin_fraction: m.sym === 'ETH' ? 200 : m.sym === 'DOGE' ? 666 : 1000, maintenance_margin_fraction: m.sym === 'ETH' ? 120 : 600, closeout_margin_fraction: m.sym === 'ETH' ? 80 : 400, daily_quote_token_volume: 2e7 })) };
const ltRates = { code: 200, funding_rates: [{ market_id: 0, exchange: 'lighter', symbol: 'ETH', rate: 0.000096 }, { market_id: 0, exchange: 'hyperliquid', symbol: 'ETH', rate: 0.0001 }, { market_id: 0, exchange: 'binance', symbol: 'ETH', rate: 0.0001 }] };

test('Hyperliquid parsers', () => {
  const m = HL.parseMetaAndCtxs(hlMeta);
  assert.strictEqual(m.ETH.maxLev, 25); close(m.ETH.px, 2500); close(m.ETH.r0, 0.0000125); close(m.kPEPE.volume24h, 5e7);
  const ps = HL.parsePositions({ assetPositions: [
    { type: 'oneWay', position: { coin: 'ETH', szi: '-2.0', entryPx: '2400', positionValue: '5000', unrealizedPnl: '-200', liquidationPx: '2850.5', marginUsed: '1000', leverage: { type: 'isolated', value: 5 } } },
    { type: 'oneWay', position: { coin: 'BTC', szi: '0.0', entryPx: '1', leverage: { type: 'cross', value: 3 } } }
  ] });
  assert.strictEqual(ps.length, 1);
  assert.deepStrictEqual([ps[0].side, ps[0].size, ps[0].notional, ps[0].lev, ps[0].liq, ps[0].mode], ['short', 2, 4800, 5, 2850.5, 'isolated']);
});

test('Hyperliquid funding history pages through 500-row responses', async () => {
  const calls = [];
  const post = async (url, body) => {
    calls.push(body.startTime);
    const rows = []; for (let t = body.startTime - (body.startTime % H) + H; t <= body.endTime && rows.length < 500; t += H) rows.push({ coin: body.coin, fundingRate: '0.0000125', premium: '0', time: t });
    return rows;
  };
  const rows = await HL.fundingHistory('ETH', 720, NOW, post);
  assert.ok(calls.length >= 2, 'should page');
  assert.ok(rows.length >= 719 && rows.length <= 720, `got ${rows.length}`);
});

test('Lighter parsers', () => {
  const m = LT.parseOrderBookDetails(ltDetails);
  assert.deepStrictEqual([m.ETH.maxLev, m.ETH.mmr, m.ETH.cmr, m.DOGE.maxLev, m['1000PEPE'].maxLev], [50, 0.012, 0.008, 15, 10]);
  const r = LT.parseFundingRates(ltRates);
  close(r.lighter.ETH, 0.000012); close(r.hyperliquid.ETH, 0.0000125);
  const f = LT.parseFundings({ fundings: [{ timestamp: 1791882000, value: '1', rate: '0.0012', direction: 'long' }, { timestamp: 1791885600, value: '1', rate: '0.0023', direction: 'short' }] });
  close(f[0].rate, 0.000012); close(f[1].rate, -0.000023); assert.strictEqual(f[0].t, 1791882000e3);
  const p = LT.parsePositions({ accounts: [{ index: 7, positions: [
    { market_id: 0, symbol: 'ETH', sign: -1, position: '1.5', avg_entry_price: '2500', position_value: '3750', liquidation_price: '2950', allocated_margin: '375', margin_mode: 1, initial_margin_fraction: '10.00' },
    { market_id: 1, symbol: 'BTC', sign: 1, position: '0', avg_entry_price: '0', liquidation_price: '0', initial_margin_fraction: '0' }
  ] }] });
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual([p[0].side, p[0].lev, p[0].liq, p[0].mode, p[0].account], ['short', 10, 2950, 'isolated', 7]);
});

test('alignHourly fills gaps and trims to the grid', () => {
  const end = Math.floor(NOW / H) * H;
  const rows = [{ t: end - 5 * H, rate: 1 }, { t: end - 3 * H + 120e3, rate: 3 }, { t: end - H, rate: 4 }];
  const a = Snapshot.alignHourly(rows, end, 6);
  assert.deepStrictEqual(a.series, [1, 1, 1, 3, 3, 4]);
  assert.strictEqual(a.missing, 3);
  assert.strictEqual(Snapshot.alignHourly([], end, 6), null);
});

/* ---------- a full snapshot built from mocked venues ---------- */
function mockApis(failHL) {
  const hist = (rate) => async (id, hours, now) => { const out = []; const end = Math.floor(now / H) * H; for (let i = hours; i >= 1; i--) out.push({ t: end - i * H, rate: rate + (i % 24 === 0 ? 3 * rate : 0) }); return out; };
  return {
    hl: { markets: async () => { if (failHL) throw new Error('down'); return HL.parseMetaAndCtxs(hlMeta); }, fundingHistory: hist(0.0000125), positions: async () => [] },
    lt: { markets: async () => LT.parseOrderBookDetails(ltDetails), currentRates: async () => LT.parseFundingRates(ltRates), fundingHistory: hist(0.000012), positions: async () => [] }
  };
}
async function mkSnap(failHL) { const a = mockApis(failHL); return Snapshot.build({ now: NOW, hl: a.hl, lt: a.lt }); }

test('snapshot builds and the engine quotes from it', async () => {
  const s = await mkSnap();
  assert.strictEqual(s.markets.length, MARKETS.length);
  assert.strictEqual(s.hist.ETH.length, 720); assert.strictEqual(s.histHL.ETH.length, 720);
  const E = TrueCost.create(s);
  assert.ok(E.hasHLHistory('ETH'));
  const c = E.compare({ sym: 'ETH', side: 'long', notional: 25000, lev: 5, hours: 72, order: 'taker', acct: 'standard' });
  assert.ok(c.hl.ok && c.lt.ok);
  close(c.hl.liq, TrueCost.liqPrice(2500, 1, 10, 5000, 1 / 50)); // HL mmr = 1 / (2 x 25)
  assert.ok(c.hl.f.median > 0 && c.hl.f.p10 <= c.hl.f.median && c.hl.f.median <= c.hl.f.p90);
  // Web encoding round-trips
  const w = Snapshot.forWeb(s); close(w.histRaw.ETH[0] * w.histUnit, s.hist.ETH[0], 1e-6);
});

test('snapshot survives one venue being down', async () => {
  const s = await mkSnap(true), E = TrueCost.create(s);
  const c = E.compare({ sym: 'ETH', side: 'long', notional: 10000, lev: 5, hours: 24, order: 'taker', acct: 'standard' });
  assert.strictEqual(c.hl.ok, false); assert.strictEqual(c.hl.maxLev, 0); assert.ok(c.lt.ok);
});

test('liquidation formula matches a hand calculation', () => {
  // 5x long, $25k at $4000, mmr 2%: margin 5000, maint 500 -> liq = 4000 - 4500/6.25/0.98
  close(TrueCost.liqPrice(4000, 1, 6.25, 5000, 0.02), 4000 - 4500 / 6.25 / 0.98);
  close(TrueCost.liqPrice(4000, -1, 6.25, 5000, 0.02), 4000 + 4500 / 6.25 / 1.02);
});

test('parseCost accepts the documented command and rejects nonsense', async () => {
  const E = TrueCost.create(await mkSnap());
  assert.deepStrictEqual(E.parseCost('/cost eth LONG 25k 5x 3d'), { sym: 'ETH', side: 'long', notional: 25000, lev: 5, hours: 72, order: 'taker', acct: 'standard' });
  assert.strictEqual(E.parseCost('/cost kpepe short 1.5m 3x 12h').notional, 1.5e6);
  assert.ok(E.parseCost('/cost DOGEZ long 1k 2x 1d').error);
  assert.ok(E.parseCost('/cost ETH long 25k 5x 30d').error);
});

/* ---------- calibration ---------- */
test('calibration logs once, scores only after the window ends', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-')), store = new Store(dir), cal = new Calibration(store);
  const s1 = await mkSnap(), E = TrueCost.create(s1);
  const recs = dailyForecasts(E, s1);
  assert.strictEqual(recs.length, MARKETS.length * 2 * 3);
  assert.strictEqual(cal.add(recs), recs.length); assert.strictEqual(cal.add(recs), 0);
  assert.strictEqual(cal.score(s1), 0);
  // Two days later: 24h forecasts are scorable, 72h and 168h are not.
  const a = mockApis(); const s2 = await Snapshot.build({ now: NOW + 48 * H, hl: a.hl, lt: a.lt });
  const n = cal.score(s2);
  assert.strictEqual(n, MARKETS.length * 2);
  const st = cal.stats('daily'); assert.strictEqual(st.n, n); assert.ok(st.byH[24] && !st.byH[72]);
  const r = cal.log().find(x => x.real != null);
  close(r.real, realized(s2, r));
  // Reload from disk
  const again = new Calibration(new Store(dir)); assert.strictEqual(again.stats('daily').n, n);
});

/* ---------- monitor and commands ---------- */
test('positions map to engine positions and alerts dedupe', async () => {
  const E = TrueCost.create(await mkSnap());
  const raw = [
    { venue: 'hl', coin: 'ETH', side: 'long', size: 10, entry: 2600, notional: 26000, margin: 2600, lev: 10, liq: 2450, mode: 'isolated' },
    { venue: 'lt', coin: '1000PEPE', side: 'short', size: 1000, entry: 100, notional: 1e5, margin: 2e4, lev: 5, liq: null, mode: 'cross' },
    { venue: 'hl', coin: 'NEWCOIN', side: 'long', size: 1, entry: 1, notional: 1, margin: 1, lev: 1, liq: null }
  ];
  const { ps, skipped } = evaluate(E, raw);
  assert.strictEqual(ps.length, 2); assert.deepStrictEqual(skipped, ['NEWCOIN (HL)']);
  assert.strictEqual(ps[1].sym, 'kPEPE');
  close(ps[0].dist, (2500 - 2450) / 2500); // venue's own liq price is used
  const al = E.alerts(ps, 0.08); assert.ok(al.some(a => a.level === 'critical' && a.text.startsWith('ETH')));
  const sent = {};
  assert.strictEqual(dedupe(al, ps, sent, NOW).length, al.length);
  assert.strictEqual(dedupe(al, ps, sent, NOW + 60e3).length, 0);
  assert.ok(dedupe(al, ps, sent, NOW + 3 * H).length >= 1); // critical repeats after 2h
});
