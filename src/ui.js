/* The bot's interface, built like the website: a chaptered "check a trade" flow on buttons,
   image cards in the TrueCost OS style, and result cards you can adjust in place.
   Everything here is pure: it takes engine/store/calibration and returns "views" that index.js sends.
   A view is { kind: 'photo'|'text', photo?: Buffer, text: html, kb: [[button]] , forceReply?: string }. */
const Cards = require('./cards');
const { fetchPositions, evaluate } = require('./monitor');

const WALLET = /^0x[0-9a-fA-F]{40}$/;
const GROUPS = { a: ['All', () => true], m: ['Majors', s => ['BTC', 'ETH', 'SOL', 'XRP'].includes(s)], l: ['Alts', s => ['HYPE', 'ENA'].includes(s)], e: ['Memes', s => ['DOGE', 'WIF', 'kPEPE', 'FARTCOIN', 'PUMP'].includes(s)] };
const MONEY = [100, 250, 500, 1000, 2500, 5000];
const LEVS = [1, 2, 3, 5, 10, 15, 20, 25, 40, 50];
const HOLDS = [[8, '8h'], [24, '1d'], [72, '3d'], [168, '1w'], [336, '2w']];
const VN = { hl: 'Hyperliquid', lt: 'Lighter' };

/* ---------- state in callback data (stateless, survives restarts; max 64 bytes) ---------- */
const enc = s => [s.sym, s.side === 'short' ? 's' : 'l', Math.round(s.margin), s.lev, s.hours, s.order === 'maker' ? 'm' : 't', s.g || 'a'].join('.');
function dec(str) {
  const [sym, side, m, lev, h, o, g] = String(str || '').split('.');
  return { sym: sym || 'ETH', side: side === 's' ? 'short' : 'long', margin: Math.max(20, +m || 1000), lev: Math.max(1, +lev || 5), hours: +h || 72, order: o === 'm' ? 'maker' : 'taker', acct: 'standard', g: GROUPS[g] ? g : 'a' };
}
const cb = (action, s, extra) => [action, enc(s)].concat(extra != null ? [extra] : []).join('|');
const btn = (text, data) => ({ text, callback_data: data });

/* ---------- formatting ---------- */
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const usd = (v, d) => { const a = Math.abs(v), dd = d != null ? d : (a < 10 ? 2 : 0); return '$' + a.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd }); };
const px = v => '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(4) : v.toPrecision(3));
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const fs = v => Math.abs(v) < 0.005 ? '$0' : (v > 0 ? 'pay ' : 'get ') + usd(v);
const hold = h => ({ 8: '8 hours', 24: '1 day', 72: '3 days', 168: '1 week', 336: '2 weeks' })[h] || (h % 24 ? h + ' hours' : h / 24 + ' days');
const kmoney = v => v >= 1000 ? '$' + (v / 1000) + 'k' : '$' + v;
const bar = d => { const n = Math.max(0, Math.min(10, Math.ceil(d / 0.05 - 1e-9))); return '■'.repeat(n) + '□'.repeat(10 - n); };
const roomWord = d => d < 0.1 ? 'very tight' : d < 0.2 ? 'tight' : 'comfortable';
const chapter = (n, title) => `<b>TrueCost Setup</b>  <code>${String(n).padStart(2, '0')} / 04</code>\n\n<b>${title}</b>`;

function makeUI(ctx) {
  // ctx: { engine(), snapshot(), store, calibration, backtest(), site(), appUrl(), api }
  const E = () => ctx.engine();
  const app = hash => ctx.appUrl() ? { text: 'Open in TrueCost OS', web_app: { url: ctx.appUrl() + (hash ? '#' + hash : '') } } : null;
  const maxLev = sym => { const m = E().market(sym); return Math.max(m.hl.maxLev, m.lt.maxLev); };
  const inputOf = s => ({ sym: s.sym, side: s.side, notional: s.margin * s.lev, lev: s.lev, hours: s.hours, order: s.order, acct: 'standard' });
  function analyse(s) {
    const inp = inputOf(s), c = E().compare(inp), oks = [c.hl, c.lt].filter(x => x.ok);
    const best = oks.length ? oks.reduce((a, b) => a.total <= b.total ? a : b) : null, other = oks.length === 2 ? (best === c.hl ? c.lt : c.hl) : null;
    return { inp, c, best, other };
  }
  function tips(s, A) {
    const out = [], { inp, best, other } = A; if (!best) return out;
    if (other && other.total - best.total >= 1) out.push(`Use ${VN[best.v]}. It's about ${usd(other.total - best.total)} cheaper here, mostly from ${Math.abs((other.entry + other.exit) - (best.entry + best.exit)) > Math.abs(other.f.median - best.f.median) ? 'fees and slippage, which are fixed' : 'holding fees, which can change'}.`);
    if (inp.order === 'taker') { const m = E().quote(Object.assign({}, inp, { order: 'maker' }), best.v); if (m.ok && best.entry - m.entry > 1) out.push(`A limit order saves about ${usd(best.entry - m.entry)} getting in, if you can wait.`); }
    if (best.dist < 0.12 && s.lev > 1) { const l2 = Math.max(1, Math.floor(s.lev / 2)), q2 = E().quote(Object.assign({}, inp, { lev: l2, notional: s.margin * l2 }), best.v); out.push(`At ${s.lev}× a ${pct(best.dist)} move wipes out your ${usd(s.margin, 0)}. At ${l2}× it would take ${pct(q2.dist)}.`); }
    if (best.f.median / s.margin > 0.01) out.push(`Holding fees eat about ${pct(best.f.median / s.margin)} of your money over ${hold(inp.hours)}.`);
    if (best.f.median < 0) out.push(`This side is being paid to hold right now: about ${usd(-best.f.median)} over ${hold(inp.hours)}.`);
    return out.slice(0, 3);
  }

  /* ---------- views ---------- */
  function home() {
    const kb = [[btn('01 · Check a trade', cb('w1', dec(''))), btn('02 · Watch my wallet', 'wa')], [btn('03 · Track record', 'rec'), btn('How it works', 'how')]];
    const a = app(''); if (a) kb.push([a]);
    return { kind: 'photo', photo: Cards.welcomeCard(), kb,
      text: '<b>TrueCost OS</b>\nKnow what a leveraged trade on Hyperliquid or Lighter really costs, <i>before</i> you place it. Pick where to start.\n\n<i>Read-only. No keys, no custody.</i>' };
  }
  function step1(s) {
    const syms = E().snapshot.markets.map(m => m.sym).filter(GROUPS[s.g][1]);
    const tabs = Object.entries(GROUPS).map(([k, g]) => btn((k === s.g ? '• ' : '') + g[0], cb('w1', Object.assign({}, s, { g: k }))));
    const grid = []; syms.forEach((sym, i) => { if (i % 4 === 0) grid.push([]); grid[grid.length - 1].push(btn((sym === s.sym ? '✓ ' : '') + sym, cb('w2', Object.assign({}, s, { sym })))); });
    return { kind: 'text', text: `${chapter(1, 'Which coin?')}\nPick one. You can change everything later.`, kb: [tabs, ...grid, [btn('‹ Menu', 'home')]] };
  }
  function step2(s) {
    return { kind: 'text', text: `${chapter(2, `Up or down on ${s.sym}?`)}\nWith perps you make money either way.\n\n<b>Up</b> is called going <b>long</b>. <b>Down</b> is going <b>short</b>.`,
      kb: [[btn('↗ Up (long)', cb('w3', Object.assign({}, s, { side: 'long' }))), btn('↘ Down (short)', cb('w3', Object.assign({}, s, { side: 'short' })))], [btn('‹ Back', cb('w1', s))]] };
  }
  function step3(s) {
    const mx = maxLev(s.sym); if (s.lev > mx) s.lev = mx;
    const A = analyse(s), b = A.best;
    const meter = b ? `\n\n<b>Room before wipe-out</b>\n<code>${bar(b.dist)}</code>  <b>${pct(b.dist)}</b> · ${roomWord(b.dist)}\nYour <b>${usd(s.margin, 0)}</b> controls <b>${usd(s.margin * s.lev, 0)}</b>. If ${s.sym} ${s.side === 'long' ? 'falls' : 'rises'} to <b>${px(b.liq)}</b>, you lose it.` : `\n\nNeither exchange allows ${s.lev}× on ${s.sym}.`;
    const money = MONEY.map(m => btn((m === s.margin ? '✓ ' : '') + kmoney(m), cb('w3', Object.assign({}, s, { margin: m }))));
    const levs = LEVS.filter(l => l <= mx).map(l => btn((l === s.lev ? '✓ ' : '') + l + '×', cb('w3', Object.assign({}, s, { lev: l }))));
    const rows = [money.slice(0, 3), money.slice(3).concat([btn('Other…', cb('am', s))])];
    for (let i = 0; i < levs.length; i += 5) rows.push(levs.slice(i, i + 5));
    rows.push([btn('‹ Back', cb('w2', s)), btn('Next ›', cb('w4', s))]);
    return { kind: 'text', text: `${chapter(3, 'How much, and how much leverage?')}\nLeverage makes the position bigger. It also shrinks your room.${meter}`, kb: rows };
  }
  function step4(s) {
    return { kind: 'text', text: `${chapter(4, 'How long will you hold it?')}\nThis matters because of the hourly holding fee (funding). A guess is fine.`,
      kb: [HOLDS.map(([h, l]) => btn((h === s.hours ? '✓ ' : '') + l, cb('res', Object.assign({}, s, { hours: h })))), [btn('‹ Back', cb('w3', s))]] };
  }
  function result(s) {
    const mx = maxLev(s.sym); if (s.lev > mx) s.lev = mx;
    const A = analyse(s), t = tips(s, A), b = A.best;
    const photo = Cards.costCard({ inp: A.inp, c: A.c, best: b, margin: s.margin, tips: t, asOf: ctx.snapshot().asOf, site: ctx.site() });
    const head = `<b>${s.sym} ${s.side === 'long' ? 'up' : 'down'} · ${usd(s.margin, 0)} at ${s.lev}× · ${hold(s.hours)}</b>`;
    const body = b ? `\nCheapest on <b>${VN[b.v]}</b>: about <b>${usd(b.total)}</b> all-in.\nHolding: ${fs(b.f.median)} likely (8 in 10: ${fs(b.f.p10)} to ${fs(b.f.p90)})\nRoom: <code>${bar(b.dist)}</code> ${pct(b.dist)}, liquidated at ${px(b.liq)}` : `\nNeither exchange allows ${s.lev}× here.`;
    const quote = t.length ? `\n<blockquote>${t.map(x => '• ' + esc(x)).join('\n')}</blockquote>` : '';
    const lower = LEVS.filter(l => l < s.lev).pop(), higher = LEVS.find(l => l > s.lev && l <= mx);
    const kb = [
      [btn(lower ? `◂ ${lower}×` : '·', lower ? cb('res', Object.assign({}, s, { lev: lower })) : 'noop'), btn(`${s.lev}× leverage`, 'noop'), btn(higher ? `${higher}× ▸` : '·', higher ? cb('res', Object.assign({}, s, { lev: higher })) : 'noop')],
      HOLDS.map(([h, l]) => btn((h === s.hours ? '✓ ' : '') + l, cb('res', Object.assign({}, s, { hours: h })))),
      [btn(s.order === 'maker' ? '✓ Limit order' : 'Try a limit order', cb('res', Object.assign({}, s, { order: s.order === 'maker' ? 'taker' : 'maker' }))), btn(s.side === 'long' ? 'Flip to short' : 'Flip to long', cb('res', Object.assign({}, s, { side: s.side === 'long' ? 'short' : 'long' })))],
      [btn(`Roll ${hold(s.hours)} of prices`, cb('roll', s)), btn('New check', cb('w1', s))]
    ];
    const a = app(`check-${s.sym}-${s.side}-${s.margin}-${s.lev}-${s.hours}`); if (a) kb.push([a]);
    return { kind: 'photo', photo, text: head + body + quote, kb };
  }
  function seeded(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pricePath(m, hours, rand) {
    const sig = m.dailyVol / Math.sqrt(24), out = [1]; let lp = 0;
    for (let h = 0; h < hours; h++) { let z = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(6.283185307 * rand()); if (rand() < 0.01) z *= 3; lp += sig * z - 0.5 * sig * sig; out.push(Math.exp(lp)); }
    return out;
  }
  const hitIndex = (path, b) => { for (let i = 1; i < path.length; i++) { const p = b.px * path[i]; if (b.side > 0 ? p <= b.liq : p >= b.liq) return i; } return -1; };
  function roll(s, rand) {
    const A = analyse(s), b = A.best; if (!b) return result(s);
    const m = E().market(s.sym), r2 = seeded(s.lev * 7919 + s.hours * 104729 + s.sym.length * 31 + (b.side > 0 ? 1 : 2)); let hits = 0;
    for (let i = 0; i < 1500; i++) if (hitIndex(pricePath(m, s.hours, r2), b) > 0) hits++;
    const path = pricePath(m, s.hours, rand || Math.random), hit = hitIndex(path, b), odds = hits / 1500;
    const end = hit > 0 ? hit : path.length - 1, pnl = b.side * (path[end] - 1) * A.inp.notional;
    const text = hit > 0 ? `<b>Wiped out at hour ${hit}.</b> The exchange closed it at ${px(b.liq)} and your ${usd(s.margin, 0)} is gone.` : `<b>Survived ${hold(s.hours)}.</b> Ended ${pnl >= 0 ? 'up' : 'down'} ${usd(pnl, 0)} before costs.`;
    return { kind: 'photo', photo: Cards.rollCard({ inp: A.inp, best: b, path, hit, odds, asOf: ctx.snapshot().asOf, site: ctx.site() }),
      text: `${text}\n<i>Practice runs with ${s.sym}'s usual swings hit the wipe-out price ${odds < 0.005 ? 'almost never' : pct(odds, 0) + ' of the time'}. A rough guide: real markets jump harder.</i>`,
      kb: [[btn('Roll again', cb('rr', s)), btn('‹ Back to the trade', cb('res', s))]] };
  }
  async function watch(chatId) {
    const u = ctx.store.user(chatId);
    if (!u.wallets.length) return { kind: 'text', text: '<b>watch.sys</b>\nSend the wallet address you trade from. I only read it: I can\'t move funds or place trades.', kb: [[btn('‹ Menu', 'home')]], forceReply: '0x… your wallet address' };
    const { raw, errors } = await fetchPositions(u.wallets, ctx.api);
    const { ps, skipped } = evaluate(E(), raw), thr = u.alertPct / 100;
    ps.forEach(p => { p.margin = p.notional / p.lev; });
    const label = u.wallets.map(w => w.slice(0, 6) + '…' + w.slice(-4)).join(', ');
    const lines = ps.length ? ps.map(p => `<b>${p.sym}</b> ${p.side === 'long' ? 'up' : 'down'} ${p.lev}× · ${VN[p.v]}\n<code>${bar(Math.max(0, p.dist))}</code> ${p.dist > 0 ? pct(p.dist) + ' room' : '<b>at liquidation</b>'} · 24h ${fs(p.f24.median)}`).join('\n\n') : 'No open positions on Hyperliquid or Lighter.';
    const kb = [
      [btn('Refresh', 'wr'), btn(u.alertsOn ? 'Alerts: on ✓' : 'Alerts: off', 'wt')],
      [btn('Warn at', 'noop')].concat([5, 8, 12, 20].map(n => btn((n === u.alertPct ? '✓ ' : '') + `${n}%`, 'wl|x|' + n))),
      [btn('Forget my wallet', 'wf'), btn('‹ Menu', 'home')]
    ];
    const a = app('watch'); if (a) kb.push([a]);
    return { kind: 'photo', photo: Cards.positionsCard({ label, ps, thr, asOf: ctx.snapshot().asOf, site: ctx.site(), skipped }),
      text: `<b>watch.sys</b> · ${esc(label)}\n\n${lines}${skipped.length ? `\n\nNot covered yet: ${esc(skipped.join(', '))}` : ''}${errors.length ? `\n\n<i>Couldn't reach ${[...new Set(errors.map(e => e.split(':')[0]))].join(' and ')} just now.</i>` : ''}\n\nI'll message you inside <b>${pct(thr, 0)}</b> of liquidation${u.alertsOn ? '' : ' (alerts paused)'}.`, kb };
  }
  function record() {
    const st = ctx.calibration.stats('daily'), live = st.n >= 30, bt = ctx.backtest();
    let d;
    if (live) {
      const scored = ctx.calibration.log().filter(r => r.real != null && r.kind === 'daily'), syms = [...new Set(scored.map(r => r.sym))];
      d = { source: 'live', n: st.n, rate: st.rate, byH: st.byH, byCoin: syms.map(sym => { const r = scored.filter(x => x.sym === sym); return { sym, n: r.length, rate: r.filter(x => x.hit).length / r.length }; }) };
    } else d = Object.assign({ source: 'backtest' }, bt);
    const h = k => d.byH[k] ? `${pct(d.byH[k].rate, 0)} of ${d.byH[k].n}` : 'not yet';
    const kb = [[btn('‹ Menu', 'home')]]; const a = app('record'); if (a) kb[0].push(a);
    return { kind: 'photo', photo: Cards.recordCard(Object.assign({}, d, { asOf: ctx.snapshot().asOf, site: ctx.site() })), kb,
      text: `<b>track-record.log</b>\nEvery funding forecast gets an 80% range. Here's how often the range held:\n<code>1 day   ${h(24)}\n3 days  ${h(72)}\n1 week  ${h(168)}</code>\n${live ? 'Scored live, as forecasts come due.' : `Backtest on real funding history. Live scores take over after ${30 - st.n > 0 ? 'the first few days' : 'today'} (${st.n} scored so far).`}` };
  }
  function how() {
    const kb = [[btn('‹ Menu', 'home')]]; const a = app('readme'); if (a) kb[0].push(a);
    return { kind: 'text', kb, text: '<b>read-me.txt</b>\n\n<b>01 · Getting in and out</b>\nFee × size, plus slippage estimated from the coin\'s 24h volume on each exchange.\n\n<b>02 · Holding fee</b>\nWe replay up to 30 days of real hourly funding a thousand times and show the likely cost plus the range 8 in 10 outcomes land in. Never one exact number.\n\n<b>03 · Wipe-out price</b>\nThe exchange\'s own liquidation formula with its maintenance margin. Room is shown as blocks: each one is a 5% move.\n\n<b>04 · Track record</b>\nEvery forecast is logged and scored when its time is up. See /record.\n\nRead-only. TrueCost never asks for keys and takes no fee today.' };
  }
  function alertMessage(a) {
    const p = a.pos, icon = a.level === 'critical' ? '‼' : a.level === 'warning' ? '⚠' : '·';
    const head = p ? `${icon} <b>${p.sym} ${p.side === 'long' ? 'up' : 'down'} ${p.lev}× · ${VN[p.v]}</b>` : `${icon} <b>watch.sys</b>`;
    const room = p && (a.kind === 'room' || a.level === 'critical') ? `\n<code>${bar(Math.max(0, p.dist))}</code> ${p.dist > 0 ? pct(p.dist) + ' room' : 'at liquidation'}` : '';
    const raw = a.text.replace(/^[^:]+:\s*/, ''), msg = esc(raw.charAt(0).toUpperCase() + raw.slice(1));
    return `${head}${room}\n${msg}`;
  }
  return { home, step1, step2, step3, step4, result, roll, watch, record, how, alertMessage, dec, enc, WALLET };
}

module.exports = { makeUI, enc, dec, bar };
