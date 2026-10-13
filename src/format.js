/* Plain-text messages for Telegram. Same wording as the web page. */
const VN = { hl: 'Hyperliquid', lt: 'Lighter' }, VS = { hl: 'HL', lt: 'LT' };
const usd = (x, d) => { const a = Math.abs(x), dd = d != null ? d : (a < 10 ? 2 : 0); return '$' + a.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd }); };
const px = x => '$' + (x >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : x >= 1 ? x.toFixed(2) : x >= 0.01 ? x.toFixed(4) : x.toPrecision(3));
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const fs = x => Math.abs(x) < 0.005 ? '$0' : (x > 0 ? 'pay ' : 'get ') + usd(x);
const hold = h => h % 24 === 0 ? (h / 24 === 1 ? '1 day' : h / 24 + ' days') : h + ' hours';
const short = a => a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a;

const help = () => [
  'I tell you what a perp trade costs before you place it, and warn you when one you hold gets risky.',
  '',
  '/cost ETH long 25k 5x 3d',
  '  coin, long or short, position size, leverage, hold time',
  '/watch 0xYourWallet',
  '  I read your Hyperliquid and Lighter positions (read-only)',
  '/positions   show what I\'m watching',
  '/alert 8     warn me when liquidation is within 8%',
  '/alerts off  pause warnings (on to resume)',
  '/unwatch     forget your wallets',
  '/record      how accurate my forecasts have been',
  '',
  'I never ask for keys and can\'t trade or move funds.'
].join('\n');

function cost(E, inp, asOf) {
  const c = E.compare(inp), L = [`${inp.sym} ${inp.side} · ${usd(inp.notional, 0)} at ${inp.lev}x · ${hold(inp.hours)}`];
  for (const k of ['hl', 'lt']) {
    const x = c[k]; L.push('');
    if (!x.ok) { L.push(x.maxLev ? `${VN[k]}: max ${x.maxLev}x on ${inp.sym}` : `${VN[k]}: not available right now`); continue; }
    L.push(VN[k], `In + out   ${usd(x.entry + x.exit)}`, `Holding    ${fs(x.f.median)}`, `  8 in 10: ${fs(x.f.p10)} to ${fs(x.f.p90)}`,
      `Wiped out  ${px(x.liq)} (${pct(x.dist)} away)`, `Total      ${x.total < 0 ? '+' : ''}${usd(x.total)}`);
  }
  if (c.hl.ok && c.lt.ok) { const b = c.hl.total <= c.lt.total ? 'hl' : 'lt'; L.push('', `→ ${VN[b]} is ~${usd(Math.abs(c.hl.total - c.lt.total))} cheaper`); }
  if (asOf) L.push('', `Prices ${asOf.slice(11, 16)} UTC`);
  return { text: L.join('\n'), quotes: c };
}

function positions(ps, skipped, thr) {
  if (!ps.length) return 'No open positions on Hyperliquid or Lighter for your wallets.' + (skipped.length ? `\nNot covered yet: ${skipped.join(', ')}` : '');
  const L = ps.map(p => `${p.sym} ${p.side} ${p.lev}x · ${VS[p.v]}${p.mode === 'cross' ? ' (cross)' : ''}\n  ${p.dist > 0 ? pct(p.dist) + ' from liquidation' : 'AT LIQUIDATION'} · next 24h ${fs(p.f24.median)}`);
  if (skipped.length) L.push(`Not covered yet: ${skipped.join(', ')}`);
  L.push('', `I'll warn you below ${pct(thr, 0)}.`);
  return L.join('\n');
}

function alertText(a) { return (a.level === 'critical' ? '‼ ' : a.level === 'warning' ? '⚠ ' : '· ') + a.text; }

function record(stats) {
  if (!stats.n) return 'No live forecasts have been scored yet. The first 1-day forecasts are scored a day after launch.';
  const h = k => stats.byH[k] ? `${pct(stats.byH[k].rate, 0)} (${stats.byH[k].n})` : 'n/a';
  return [`Live funding forecasts scored: ${stats.n}`, `80% ranges held ${pct(stats.rate, 0)} of the time`, `1 day ${h(24)} · 3 days ${h(72)} · 1 week ${h(168)}`, '', 'Every forecast is logged when made and scored when its hold time ends.'].join('\n');
}

module.exports = { help, cost, positions, alertText, record, short, usd, pct, px };
