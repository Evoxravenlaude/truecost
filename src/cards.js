/* Image cards for the Telegram bot, drawn in the TrueCost OS style of the website:
   lavender dotted desk, paper window with a purple title bar and hard shadow, pixel headings,
   inset stat panels, the 10-block "room" bar and the yellow "what we'd do" note. */
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'PixelifySans_700Bold.ttf'), 'TC Pixel');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'AtkinsonHyperlegible_400Regular.ttf'), 'TC Body');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'AtkinsonHyperlegible_700Bold.ttf'), 'TC Body Bold');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'JetBrainsMono_400Regular.ttf'), 'TC Mono');
GlobalFonts.registerFromPath(path.join(FONT_DIR, 'JetBrainsMono_600SemiBold.ttf'), 'TC Mono Bold');

const C = {
  desk: '#c9b6ea', dot: '#b7a1e2', win: '#f7f4ee', win2: '#ece7dc', ink: '#1b1530', muted: '#5f5873', hair: '#d8d0c2',
  titleA: '#2a1a6e', titleB: '#6d55d6', accent: '#5b3fd0', lav: '#c9b6ea', lavSoft: '#e9e1f7',
  pay: '#b3321c', recv: '#0d7a4e', warn: '#9a6400', gold: '#e0a526', note: '#fff6c8', noteInk: '#3b3216', night: '#0c0c0d'
};
const F = {
  pixel: s => `${s}px "TC Pixel"`, body: s => `${s}px "TC Body"`, bold: s => `${s}px "TC Body Bold"`,
  mono: s => `${s}px "TC Mono"`, monoB: s => `${s}px "TC Mono Bold"`
};
const SCALE = 1.25, W = 960;

const ICONS = {
  calc: ['................', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..', '..kwaaaaaaaawk..', '..kwaaaaaaaawk..', '..kwwwwwwwwwwk..', '..kwkkwkkwkkwk..', '..kwkkwkkwkkwk..', '..kwwwwwwwwwwk..', '..kwkkwkkwppwk..', '..kwkkwkkwppwk..', '..kwwwwwwwwwwk..', '..kwkkwkkwggwk..', '..kwkkwkkwggwk..', '..kkkkkkkkkkkk..', '................'],
  eye: ['................', '................', '................', '.....kkkkkk.....', '...kkwwwwwwkk...', '..kwwwwaawwwwk..', '.kwwwwakkkawwwk.', 'kwwwwaakkkaawwwk', '.kwwwwakkkawwwk.', '..kwwwwaawwwwk..', '...kkwwwwwwkk...', '.....kkkkkk.....', '................', '................', '................', '................'],
  chart: ['................', '................', '............kkk.', '............kak.', '........kkk.kak.', '........kak.kak.', '....kkk.kak.kak.', '....kgk.kak.kak.', '....kgk.kak.kak.', 'kkk.kgk.kak.kak.', 'kpk.kgk.kak.kak.', 'kpk.kgk.kak.kak.', 'kkkkkkkkkkkkkkkk', '................', '................', '................'],
  trophy: ['................', '...kkkkkkkkkk...', '.kkkyyyyyyyykkk.', '.k.kyyyyyyyyk.k.', '.k.kyyyyyyyyk.k.', '..kkyyyyyyyykk..', '....kyyyyyyk....', '.....kyyyyk.....', '......kyyk......', '.......kk.......', '.......kk.......', '.....kkkkkk.....', '.....kyyyyk.....', '.....kkkkkk.....', '................', '................']
};

/* ---------- primitives ---------- */
function canvas(h) {
  const c = createCanvas(Math.round(W * SCALE), Math.round(h * SCALE)), x = c.getContext('2d');
  x.scale(SCALE, SCALE); x.textBaseline = 'alphabetic';
  return { c, x };
}
function desk(x, h, dark) {
  x.fillStyle = dark ? C.night : C.desk; x.fillRect(0, 0, W, h);
  x.fillStyle = dark ? '#1e1a2c' : C.dot;
  for (let i = 7; i < W; i += 14) for (let j = 7; j < h; j += 14) x.fillRect(i - 1, j - 1, 2, 2);
}
function pixelIcon(x, name, px, py, size, pal) {
  const p = Object.assign({ k: C.ink, w: '#ffffff', a: C.accent, p: C.pay, g: C.recv, y: C.gold, l: C.lav }, pal || {}), u = size / 16;
  ICONS[name].forEach((row, j) => { for (let i = 0; i < 16; i++) { const ch = row[i]; if (ch !== '.') { x.fillStyle = p[ch]; x.fillRect(px + i * u, py + j * u, u + 0.2, u + 0.2); } } });
}
function text(x, s, px, py, font, color, align) { x.font = font; x.fillStyle = color; x.textAlign = align || 'left'; x.fillText(s, px, py); return x.measureText(s).width; }
function width(x, s, font) { x.font = font; return x.measureText(s).width; }
function fit(x, s, font, max) { if (width(x, s, font) <= max) return s; while (s.length > 1 && width(x, s + '…', font) > max) s = s.slice(0, -1); return s + '…'; }
function wrap(x, s, font, max) {
  const words = String(s).split(/\s+/), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (width(x, t, font) > max && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function rect(x, px, py, w, h, fill, stroke, lw) { if (fill) { x.fillStyle = fill; x.fillRect(px, py, w, h); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw || 2; x.strokeRect(px + (lw || 2) / 2, py + (lw || 2) / 2, w - (lw || 2), h - (lw || 2)); } }
function inset(x, px, py, w, h) { rect(x, px, py, w, h, C.win, C.ink, 2); x.fillStyle = C.hair; x.fillRect(px + 2, py + 2, w - 4, 3); x.fillRect(px + 2, py + 2, 3, h - 4); }
/* Window frame. Returns the body origin and inner width. */
function win(x, px, py, w, h, title, icon) {
  x.fillStyle = 'rgba(27,21,48,.9)'; x.fillRect(px + 7, py + 7, w, h);
  rect(x, px, py, w, h, C.win, C.ink, 2.5);
  const g = x.createLinearGradient(px, 0, px + w, 0); g.addColorStop(0, C.titleA); g.addColorStop(1, C.titleB);
  x.fillStyle = g; x.fillRect(px + 2.5, py + 2.5, w - 5, 36);
  pixelIcon(x, icon, px + 12, py + 10, 20, { k: '#ffffff', w: C.titleA });
  text(x, title, px + 42, py + 27, F.pixel(18), '#ffffff');
  ['_', '□', '×'].forEach((b, i) => { const bx = px + w - 34 - (2 - i) * 30, by = py + 9; rect(x, bx, by, 24, 21, C.win, C.ink, 1.5); text(x, b, bx + 12, by + 16, F.monoB(13), C.ink, 'center'); });
  x.fillStyle = C.ink; x.fillRect(px, py + 38, w, 2);
  return { bx: px + 26, by: py + 40 + 24, iw: w - 52 };
}
function statusBar(x, px, py, w, left, right) {
  rect(x, px + 2.5, py, w - 5, 28, C.win2); x.fillStyle = C.ink; x.fillRect(px, py, w, 2);
  x.fillStyle = C.recv; x.fillRect(px + 14, py + 11, 8, 8);
  text(x, left, px + 30, py + 19, F.mono(12.5), C.muted);
  if (right) text(x, right, px + w - 14, py + 19, F.mono(12.5), C.muted, 'right');
}
function kicker(x, s, px, py, color) { text(x, s.toUpperCase(), px, py, F.monoB(12.5), color || C.muted); }
function headline(x, a, b, px, py, size) { const w1 = text(x, a, px, py, F.pixel(size || 34), C.ink); if (b) text(x, b, px + w1, py, F.pixel(size || 34), C.accent); }
const blocks = d => Math.max(0, Math.min(10, Math.ceil(d / 0.05 - 1e-9)));
const blockColor = n => n <= 2 ? C.pay : n <= 4 ? C.warn : C.recv;
function hp(x, px, py, w, h, dist) {
  const n = blocks(dist), gap = 4, bw = (w - gap * 9) / 10;
  for (let i = 0; i < 10; i++) rect(x, px + i * (bw + gap), py, bw, h, i < n ? blockColor(n) : C.win, C.ink, 1.5);
  return n;
}
function pill(x, s, px, py, color, bg) { x.font = F.monoB(11.5); const w = x.measureText(s.toUpperCase()).width + 16; rect(x, px, py, w, 22, bg, color, 1.5); text(x, s.toUpperCase(), px + 8, py + 15.5, F.monoB(11.5), color); return w; }
function stickyNote(x, px, py, w, title, lines) {
  const font = F.body(17), lh = 24; const wrapped = lines.flatMap(l => wrap(x, l, font, w - 50).map((t, i) => (i ? '  ' : '• ') + t));
  const h = 46 + wrapped.length * lh + 12;
  x.save(); x.translate(px + w / 2, py + h / 2); x.rotate(-0.006); x.translate(-(px + w / 2), -(py + h / 2));
  x.fillStyle = 'rgba(27,21,48,.9)'; x.fillRect(px + 5, py + 5, w, h); rect(x, px, py, w, h, C.note, C.ink, 2);
  kicker(x, title, px + 18, py + 28, '#6e6036');
  wrapped.forEach((t, i) => text(x, t, px + 18, py + 56 + i * lh, font, C.noteInk));
  x.restore(); return h;
}
const png = c => c.toBuffer('image/png');

/* ---------- money/format helpers (kept local so cards stay pure) ---------- */
const usd = (v, d) => { const a = Math.abs(v), dd = d != null ? d : (a < 10 ? 2 : 0); return '$' + a.toLocaleString('en-US', { minimumFractionDigits: dd, maximumFractionDigits: dd }); };
const px$ = v => '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(4) : v.toPrecision(3));
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const fs = v => Math.abs(v) < 0.005 ? '$0' : (v > 0 ? 'pay ' : 'get ') + usd(v);
const hold = h => ({ 8: '8 hours', 24: '1 day', 72: '3 days', 168: '1 week', 336: '2 weeks' })[h] || (h % 24 ? h + ' hours' : h / 24 + ' days');
const VN = { hl: 'Hyperliquid', lt: 'Lighter' };
const stamp = asOf => { const d = new Date(asOf); return d.toUTCString().slice(5, 11) + ' ' + d.toUTCString().slice(17, 22) + ' UTC'; };

/* ---------- cards ---------- */
/* Trade check: q = { inp, c: {hl, lt}, best, margin, tips: [plain strings], asOf, site } */
function costCard(q) {
  const tmp = createCanvas(10, 10).getContext('2d');
  const noteH = q.tips.length ? 46 + q.tips.flatMap(t => wrap(tmp, t, F.body(17), 856 - 50)).length * 24 + 12 : 0;
  const H = 28 + 40 + 24 + 66 + 168 + 26 + 36 + 5 * 32 + (noteH ? 24 + noteH : 0) + 26 + 28 + 30;
  const { c, x } = canvas(H); desk(x, H);
  const ww = W - 56, wh = H - 56, { bx, by, iw } = win(x, 28, 28, ww, wh, 'trade-check.exe', 'calc');
  const { inp, best } = q;
  kicker(x, `${inp.sym} ${inp.side === 'long' ? 'up' : 'down'} · ${usd(q.margin, 0)} at ${inp.lev}× · ${hold(inp.hours)}`, bx, by + 6);
  headline(x, 'What this trade ', 'really costs.', bx, by + 46);
  const py = by + 66, pw = (iw - 32) / 3, ph = 168;
  if (best) {
    const perDay = best.f.median / (inp.hours / 24);
    // panel 1
    inset(x, bx, py, pw, ph); kicker(x, 'Getting in and out', bx + 16, py + 28);
    text(x, usd(best.entry + best.exit), bx + 16, py + 72, F.pixel(38), C.ink);
    wrap(x, `Fees + slippage on ${VN[best.v]}, ${usd(inp.notional, 0)} position`, F.body(15), pw - 32).slice(0, 3).forEach((l, i) => text(x, l, bx + 16, py + 102 + i * 20, F.body(15), C.muted));
    // panel 2
    const p2 = bx + pw + 16; inset(x, p2, py, pw, ph); kicker(x, `Holding · ${hold(inp.hours)}`, p2 + 16, py + 28);
    text(x, fit(x, fs(best.f.median), F.pixel(38), pw - 32), p2 + 16, py + 72, F.pixel(38), best.f.median > 0.005 ? C.pay : best.f.median < -0.005 ? C.recv : C.ink);
    text(x, `most likely · ${fs(perDay)} a day`, p2 + 16, py + 102, F.body(15), C.muted);
    text(x, '8 in 10:', p2 + 16, py + 126, F.body(15), C.muted);
    text(x, fit(x, `${fs(best.f.p10)} to ${fs(best.f.p90)}`, F.mono(14), pw - 32), p2 + 16, py + 148, F.mono(14), C.ink);
    // panel 3
    const p3 = bx + 2 * (pw + 16); inset(x, p3, py, pw, ph); kicker(x, 'Room before wipe-out', p3 + 16, py + 28);
    text(x, pct(best.dist), p3 + 16, py + 72, F.pixel(38), C.ink);
    const n = hp(x, p3 + 16, py + 86, pw - 32, 20, best.dist);
    text(x, n <= 2 ? 'very tight' : n <= 4 ? 'tight' : 'comfortable', p3 + 16, py + 126, F.monoB(12), blockColor(n));
    text(x, `liquidated at ${px$(best.liq)}`, p3 + 16, py + 150, F.body(15), C.muted);
  } else {
    inset(x, bx, py, iw, ph); text(x, `Neither exchange allows ${inp.lev}× on ${inp.sym}.`, bx + 20, py + 70, F.pixel(26), C.ink);
    text(x, 'Lower the leverage and try again.', bx + 20, py + 104, F.body(17), C.muted);
  }
  // comparison table
  let ty = py + ph + 26; const c1 = bx + 250, cw = (iw - 250) / 2;
  ['hl', 'lt'].forEach((v, i) => {
    const cx = c1 + i * cw, isBest = best && best.v === v && q.c.hl.ok && q.c.lt.ok;
    if (isBest) rect(x, cx, ty - 4, cw, 36 + 5 * 32 + 6, C.lavSoft, C.accent, 2);
    text(x, VN[v], cx + cw - 14, ty + 22, F.pixel(19), C.ink, 'right');
    if (isBest) pill(x, 'cheaper', cx + 12, ty + 6, '#ffffff', C.accent);
  });
  x.fillStyle = C.ink; x.fillRect(bx, ty + 34, iw, 2);
  const rows = [
    ['In + out', v => usd(v.entry + v.exit)],
    ['Holding, most likely', v => fs(v.f.median)],
    ['Holding, 8 in 10', v => `${fs(v.f.p10)} to ${fs(v.f.p90)}`],
    ['Liquidation price', v => `${px$(v.liq)} (${pct(v.dist)})`],
    ['Expected total', v => (v.total < 0 ? '+' : '') + usd(v.total)]
  ];
  rows.forEach(([label, f], r) => {
    const ry = ty + 36 + r * 32;
    if (r) { x.fillStyle = C.hair; x.fillRect(bx, ry, iw, 1); }
    text(x, label, bx, ry + 22, r === 4 ? F.bold(16) : F.body(16), C.ink);
    ['hl', 'lt'].forEach((v, i) => { const q2 = q.c[v], cx = c1 + (i + 1) * cw - 14; text(x, fit(x, q2.ok ? f(q2) : (r ? '' : `max ${q2.maxLev}×`), r === 4 ? F.monoB(15) : F.mono(14.5), cw - 24), cx, ry + 22, r === 4 ? F.monoB(15) : F.mono(14.5), C.ink, 'right'); });
  });
  ty += 36 + 5 * 32;
  if (noteH) stickyNote(x, bx, ty + 24, iw, "What we'd do", q.tips);
  statusBar(x, 28, 28 + wh - 30, ww, `data ${stamp(q.asOf)} · Hyperliquid · Lighter`, q.site || '');
  return png(c);
}

/* Positions: d = { label, ps: [engine positions with margin], thr, asOf, site, skipped } */
function positionsCard(d) {
  const rows = d.ps.slice(0, 8), rh = 58, H = 28 + 40 + 24 + 66 + 34 + Math.max(1, rows.length) * rh + 24 + 28 + 30;
  const { c, x } = canvas(H); desk(x, H);
  const ww = W - 56, wh = H - 56, { bx, by, iw } = win(x, 28, 28, ww, wh, 'watch.sys', 'eye');
  kicker(x, `${d.label} · ${rows.length} position${rows.length === 1 ? '' : 's'} · warn inside ${pct(d.thr, 0)}`, bx, by + 6);
  headline(x, 'Watched for you, ', 'daily.', bx, by + 46);
  const ty = by + 66, cols = [0, 250, 400, 520, 760];
  ['Position', 'Entry → now', 'P/L', 'Room', 'Fee 24h'].forEach((h, i) => text(x, h.toUpperCase(), bx + cols[i] + (i === 2 || i === 4 ? 0 : 0), ty + 20, F.monoB(11.5), C.muted));
  x.fillStyle = C.ink; x.fillRect(bx, ty + 30, iw, 2);
  if (!rows.length) text(x, 'No open positions on Hyperliquid or Lighter.', bx, ty + 70, F.body(18), C.muted);
  rows.forEach((p, r) => {
    const ry = ty + 34 + r * rh; if (r) { x.fillStyle = C.hair; x.fillRect(bx, ry, iw, 1); }
    const sw = text(x, p.sym, bx, ry + 26, F.pixel(19), C.ink); text(x, ` ${p.side === 'long' ? 'up' : 'down'} ${p.lev}×`, bx + sw, ry + 26, F.bold(16), C.ink);
    text(x, VN[p.v] + (p.mode === 'cross' ? ' · cross' : ''), bx, ry + 46, F.body(13.5), C.muted);
    text(x, `${px$(p.entry)} → ${px$(p.mark)}`, bx + cols[1], ry + 34, F.mono(13.5), C.ink);
    text(x, `${p.pnl >= 0 ? '+' : '−'}${usd(p.pnl, 0)}`, bx + cols[2], ry + 34, F.monoB(14.5), p.pnl >= 0 ? C.recv : C.pay);
    hp(x, bx + cols[3], ry + 19, 160, 16, Math.max(0, p.dist)); text(x, p.dist > 0 ? pct(p.dist) : 'AT LIQ', bx + cols[3] + 172, ry + 33, F.monoB(13.5), blockColor(blocks(Math.max(0, p.dist))));
    text(x, fs(p.f24.median), bx + cols[4], ry + 34, F.mono(13.5), p.f24.median > 0.005 ? C.pay : p.f24.median < -0.005 ? C.recv : C.ink);
  });
  statusBar(x, 28, 28 + wh - 30, ww, `read-only · data ${stamp(d.asOf)}${d.skipped && d.skipped.length ? ' · not covered: ' + d.skipped.join(', ') : ''}`, d.site || '');
  return png(c);
}

/* Roll the hold: d = { inp, best, path (multipliers), hit, odds, asOf, site } */
function rollCard(d) {
  const H = 28 + 40 + 24 + 66 + 300 + 70 + 28 + 30, { c, x } = canvas(H); desk(x, H);
  const ww = W - 56, wh = H - 56, { bx, by, iw } = win(x, 28, 28, ww, wh, 'play-it-out.exe', 'chart');
  const { inp, best: b } = d;
  kicker(x, `${inp.sym} ${inp.side === 'long' ? 'up' : 'down'} · ${inp.lev}× · ${hold(inp.hours)} of prices`, bx, by + 6);
  headline(x, 'One way it ', 'could go.', bx, by + 46);
  const cx = bx, cy = by + 66, cw = iw, ch = 300; inset(x, cx, cy, cw, ch);
  const prices = d.path.map(m => m * b.px), end = d.hit > 0 ? d.hit : prices.length - 1;
  let lo = Math.min(b.liq, ...prices), hi = Math.max(b.liq, ...prices); const pad = (hi - lo) * 0.12 || b.px * 0.05; lo -= pad; hi += pad;
  const L = cx + 16, R = cx + cw - 16, T = cy + 16, B = cy + ch - 30, Y = v => B - (v - lo) / (hi - lo) * (B - T), X = i => L + i / (prices.length - 1) * (R - L);
  x.setLineDash([8, 6]); x.strokeStyle = C.pay; x.lineWidth = 2; x.beginPath(); x.moveTo(L, Y(b.liq)); x.lineTo(R, Y(b.liq)); x.stroke();
  x.setLineDash([2, 5]); x.strokeStyle = C.muted; x.beginPath(); x.moveTo(L, Y(b.px)); x.lineTo(R, Y(b.px)); x.stroke(); x.setLineDash([]);
  text(x, `wipe-out ${px$(b.liq)}`, R, Y(b.liq) + (b.side > 0 ? 18 : -8), F.monoB(13), C.pay, 'right');
  text(x, `entry ${px$(b.px)}`, L, Y(b.px) + (b.side > 0 ? -8 : 18), F.mono(13), C.muted);
  text(x, 'hour 0', L, cy + ch - 10, F.mono(12), C.muted); text(x, `hour ${inp.hours}`, R, cy + ch - 10, F.mono(12), C.muted, 'right');
  x.strokeStyle = C.accent; x.lineWidth = 3; x.lineJoin = 'round'; x.beginPath();
  for (let i = 0; i <= end; i++) i ? x.lineTo(X(i), Y(prices[i])) : x.moveTo(X(i), Y(prices[i])); x.stroke();
  const ex = X(end), ey = Y(prices[end]);
  if (d.hit > 0) { x.strokeStyle = C.pay; x.lineWidth = 4; x.beginPath(); x.moveTo(ex - 9, ey - 9); x.lineTo(ex + 9, ey + 9); x.moveTo(ex + 9, ey - 9); x.lineTo(ex - 9, ey + 9); x.stroke(); }
  else { x.fillStyle = C.accent; x.fillRect(ex - 6, ey - 6, 12, 12); }
  const pnl = b.side * (prices[end] / b.px - 1) * inp.notional, label = d.hit > 0 ? `WIPED OUT · HOUR ${d.hit}` : `SURVIVED · ${pnl >= 0 ? '+' : '−'}${usd(pnl, 0)}`, col = d.hit > 0 ? C.pay : C.recv;
  x.save(); x.font = F.pixel(28); const sw = x.measureText(label).width + 36; x.translate(cx + cw - sw / 2 - 40, cy + 60); x.rotate(-0.08);
  rect(x, -sw / 2, -26, sw, 50, C.win, col, 4); text(x, label, 0, 10, F.pixel(28), col, 'center'); x.restore();
  wrap(x, `In 1,500 practice runs with ${inp.sym}'s usual swings, this trade hit its wipe-out price ${d.odds < 0.005 ? 'almost never' : pct(d.odds, 0) + ' of the time'}. A rough guide: real markets jump harder.`, F.body(16.5), iw).slice(0, 2)
    .forEach((l, i) => text(x, l, bx, cy + ch + 30 + i * 22, F.body(16.5), C.ink));
  statusBar(x, 28, 28 + wh - 30, ww, `simulated prices · data ${stamp(d.asOf)}`, d.site || '');
  return png(c);
}

/* Track record: d = { source: 'live'|'backtest', n, rate, byH: {24:{n,rate},...}, byCoin: [{sym, rate, n}], asOf, site } */
function recordCard(d) {
  const coins = d.byCoin || [], gridRows = Math.ceil(coins.length / 6), H = 28 + 40 + 24 + 66 + 150 + 30 + gridRows * 70 + 20 + 28 + 30;
  const { c, x } = canvas(H); desk(x, H);
  const ww = W - 56, wh = H - 56, { bx, by, iw } = win(x, 28, 28, ww, wh, 'track-record.log', 'chart');
  kicker(x, `${d.source === 'live' ? 'live forecasts' : 'backtest on real funding'} · ${d.n} scored`, bx, by + 6);
  headline(x, 'We publish ', "how often we're wrong.", bx, by + 46, 32);
  const py = by + 70;
  [[24, '1 day'], [72, '3 days'], [168, '1 week']].forEach(([h, l], i) => {
    const r = d.byH[h], ry = py + i * 44, x0 = bx + 90, bw = iw - 90 - 150;
    text(x, l, bx, ry + 22, F.body(17), C.ink);
    rect(x, x0, ry + 6, bw, 22, C.win, C.ink, 2);
    if (r) { x.fillStyle = C.accent; x.fillRect(x0 + 2, ry + 8, (bw - 4) * r.rate, 18); }
    x.fillStyle = C.ink; x.fillRect(x0 + bw * 0.8 - 1.5, ry, 3, 34);
    text(x, r ? `${pct(r.rate, 0)} of ${r.n}` : 'not yet', bx + iw, ry + 23, F.monoB(15), C.ink, 'right');
  });
  text(x, 'The black line is the 80% target. Below it, the ranges are too narrow.', bx, py + 148, F.body(14.5), C.muted);
  const gy = py + 172, gw = (iw - 5 * 10) / 6;
  coins.forEach((m, i) => {
    const gx = bx + (i % 6) * (gw + 10), yy = gy + Math.floor(i / 6) * 70;
    rect(x, gx, yy, gw, 60, C.win, C.ink, 1.5); text(x, m.sym, gx + 10, yy + 24, F.pixel(16), C.ink);
    text(x, `${pct(m.rate, 0)} held`, gx + 10, yy + 46, F.monoB(13), m.rate < 0.65 ? C.pay : m.rate > 0.9 ? C.warn : C.recv);
  });
  statusBar(x, 28, 28 + wh - 30, ww, `${d.source === 'live' ? 'scored live' : 'walk-forward backtest'} · data ${stamp(d.asOf)}`, d.site || '');
  return png(c);
}

/* Welcome / boot screen, also used for the bot's description picture (640x360 crop works). */
function welcomeCard(d) {
  const H = 540, { c, x } = canvas(H); desk(x, H, true);
  pixelIcon(x, 'calc', 60, 56, 64, { k: '#e9e3fb', w: '#2b2640', a: '#7e66e6' });
  text(x, 'TrueCost OS', 140, 106, F.pixel(54), '#efeaf9');
  ['> know the fee', '> know the holding cost', '> know the wipe-out price'].forEach((l, i) => text(x, l, 62, 176 + i * 28, F.mono(18), '#c9b6ea'));
  const items = [['01', 'Check a trade'], ['02', 'Watch your wallet'], ['03', 'Track record']];
  items.forEach(([n, l], i) => {
    const yy = 300 + i * 52; x.fillStyle = '#2c2840'; x.fillRect(60, yy - 34, W - 120, 1);
    text(x, n, 62, yy, F.monoB(15), '#7e66e6'); text(x, l, 120, yy + 2, F.pixel(30), i === 0 ? '#f0c04a' : '#efeaf9');
  });
  x.fillStyle = '#2c2840'; x.fillRect(60, 300 + 3 * 52 - 34, W - 120, 1);
  const segs = 20, bw = W - 120 - 70, sw = (bw - 8 - 19 * 3) / segs; rect(x, 60, H - 62, bw, 22, null, '#e9e3fb', 2);
  for (let i = 0; i < segs; i++) { x.fillStyle = '#7e66e6'; x.fillRect(64 + i * (sw + 3), H - 58, sw, 14); }
  text(x, '100', W - 60, H - 42, F.pixel(26), '#efeaf9', 'right');
  text(x, d && d.footer ? d.footer : 'read-only · no keys · no custody', 60, H - 16, F.mono(13), '#a59ebb');
  return png(c);
}

/* Square avatar for BotFather /setuserpic. */
function avatar() {
  const S = 640, c = createCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = C.desk; x.fillRect(0, 0, S, S); x.fillStyle = C.dot; for (let i = 10; i < S; i += 20) for (let j = 10; j < S; j += 20) x.fillRect(i - 1.5, j - 1.5, 3, 3);
  pixelIcon(x, 'calc', 120, 110, 400, {});
  return png(c);
}

module.exports = { costCard, positionsCard, rollCard, recordCard, welcomeCard, avatar, C };
