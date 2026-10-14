/* TrueCost service. One process does everything:
   - refreshes Hyperliquid + Lighter data every hour and rebuilds the web page from it
   - serves the page, a health check and JSON feeds on $PORT
   - runs the Telegram bot and position alerts (only if TELEGRAM_BOT_TOKEN is set)
   - keeps the public accuracy log */
require('./env');
const fs = require('fs');
const path = require('path');
const TrueCost = require('./engine');
const Snapshot = require('./snapshot');
const Store = require('./store');
const WebPage = require('./webpage');
const { createServer } = require('./server');
const { Calibration, dailyForecasts } = require('./calibration');
const { WALLET } = require('./ui');
const BotUI = require('./bot');
const { fetchPositions, evaluate, dedupe } = require('./monitor');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PORT = +process.env.PORT || 3000;
const REFRESH_MIN = +process.env.REFRESH_MIN || 60;
const ALERT_MIN = +process.env.ALERT_MIN || 10;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const store = new Store(DATA_DIR), calibration = new Calibration(store);
const state = { snap: null, E: null, web: null, html: null, builtAt: null, bot: null, lastError: null, started: new Date().toISOString(), backtest: null };
// Public address of this service, for the Telegram mini app and links. Railway sets RAILWAY_PUBLIC_DOMAIN once a domain exists.
const APP_URL = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/$/, '');
const SITE = APP_URL.replace(/^https?:\/\//, '');
function summarise(rows) {
  const byH = {}; [24, 72, 168].forEach(h => { const r = rows.filter(x => x.H === h); if (r.length) byH[h] = { n: r.length, rate: r.filter(x => x.hit).length / r.length }; });
  const syms = [...new Set(rows.map(r => r.sym))];
  return { n: rows.length, rate: rows.length ? rows.filter(x => x.hit).length / rows.length : 0, byH, byCoin: syms.map(sym => { const r = rows.filter(x => x.sym === sym); return { sym, n: r.length, rate: r.filter(x => x.hit).length / r.length }; }) };
}

function rebuildPage(web, source) {
  const t0 = Date.now(), { html, forecasts } = WebPage.build(web);
  state.html = WebPage.documentFor(html, { live: true, bot: state.bot }); state.web = web; state.builtAt = new Date().toISOString();
  log(`page rebuilt from ${source} (${forecasts} backtest forecasts, ${Date.now() - t0} ms)`);
}

async function refresh() {
  try {
    const s = await Snapshot.build({ log });
    if (!s.markets.length) throw new Error('no markets loaded from either venue');
    state.snap = s; state.E = TrueCost.create(s); state.lastError = null;
    s.notes.forEach(n => log('note:', n));
    const web = Snapshot.forWeb(s);
    fs.writeFileSync(path.join(DATA_DIR, 'snapshot.web.json'), JSON.stringify(web));
    const added = new Date(s.asOf).getUTCHours() === 0 || !calibration.log().length ? calibration.add(dailyForecasts(state.E, s)) : 0;
    const scored = calibration.score(s);
    fs.writeFileSync(path.join(DATA_DIR, 'accuracy.json'), JSON.stringify(accuracy()));
    log(`snapshot ${s.asOf}: ${s.markets.length} markets, ${added} forecasts logged, ${scored} scored`);
    state.backtest = summarise(state.E.backtest());
    rebuildPage(web, 'live data');
  } catch (e) { state.lastError = e.message; log('refresh failed:', e.message); }
}
const accuracy = () => ({ asOf: state.snap && state.snap.asOf, daily: calibration.stats('daily'), asked: calibration.stats('asked') });

/* Wallet lookups from the web page: read-only, light rate limit per IP. */
const hits = new Map();
async function positionsFor(wallet, ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60e3); h.push(now); hits.set(ip, h);
  if (h.length > 10) return { code: 429, body: { error: 'Too many lookups. Try again in a minute.' } };
  if (!WALLET.test(wallet || '')) return { code: 400, body: { error: 'That doesn\'t look like a wallet address (0x followed by 40 characters).' } };
  if (!state.E) return { code: 503, body: { error: 'Still loading market data. Try again in a minute.' } };
  const { raw, errors } = await fetchPositions([wallet]);
  const { ps, skipped } = evaluate(state.E, raw);
  return { code: 200, body: { asOf: state.snap.asOf, skipped, errors: [...new Set(errors.map(e => e.split(':')[0]))],
    positions: ps.map(p => ({ sym: p.sym, v: p.v, side: p.side, entry: p.entry, notional: p.notional, lev: p.lev, margin: p.notional / p.lev, liq: p.liq, mode: p.mode })) } };
}

async function startBot(token) {
  const { Bot } = require('grammy');
  const bot = new Bot(token);
  const deps = {
    engine: () => state.E, snapshot: () => state.snap, store, calibration, site: () => SITE, appUrl: () => APP_URL,
    backtest: () => state.backtest || summarise([]),
    logAsked: inp => {
      const start = Date.parse(state.snap.asOf);
      calibration.add(['hl', 'lt'].map(v => { const f = state.E.funding(inp.sym, v, 1, 1, inp.hours); return { id: `${inp.sym}|${v}|${inp.hours}|${start}|asked`, sym: inp.sym, v, hours: inp.hours, start, p10: f.p10, p50: f.median, p90: f.p90, kind: 'asked' }; }));
    }
  };
  const { ui } = BotUI.attach(bot, deps, log);
  bot.catch(e => log('bot error:', e.message));
  await bot.init();
  state.bot = bot.botInfo.username;
  await BotUI.setupProfile(bot, APP_URL, log);

  // Alerts: one message per check, styled like watch.sys, with buttons back into the app.
  setInterval(async () => {
    if (!state.E) return;
    for (const [chatId, u] of Object.entries(store.users())) {
      if (!u.alertsOn || !u.wallets.length) continue;
      try {
        const { raw } = await fetchPositions(u.wallets);
        const { ps } = evaluate(state.E, raw);
        const fresh = dedupe(state.E.alerts(ps, u.alertPct / 100), ps, u.sent = u.sent || {});
        if (fresh.length) {
          const kb = [[{ text: 'Open watch.sys', callback_data: 'wn' }]];
          if (APP_URL) kb[0].push({ text: 'Open in TrueCost OS', web_app: { url: APP_URL + '#watch' } });
          await bot.api.sendMessage(chatId, fresh.map(ui.alertMessage).join('\n\n'), { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        }
        store.saveUser(chatId, u);
      } catch (e) {
        log(`alerts for ${chatId} failed:`, e.message);
        if (/bot was blocked|chat not found/i.test(e.message)) store.removeUser(chatId);
      }
    }
  }, ALERT_MIN * 60e3);

  bot.start({ onStart: me => log(`bot @${me.username} running${APP_URL ? ', mini app at ' + APP_URL : ''}`) });
  return bot;
}

async function main() {
  // 1. Serve something straight away: the bundled sample page, replaced as soon as live data loads.
  rebuildPage(WebPage.sample(), 'bundled sample');
  const server = createServer({
    html: () => state.html,
    snapshot: () => state.web,
    accuracy,
    positions: positionsFor,
    health: () => ({ ok: true, live: !!state.snap, asOf: state.snap && state.snap.asOf, markets: state.snap ? state.snap.markets.length : 0, pageBuiltAt: state.builtAt, bot: state.bot ? '@' + state.bot : null, lastError: state.lastError, started: state.started })
  });
  server.listen(PORT, () => log(`web on :${PORT}`));

  // 2. Telegram bot, if configured.
  let bot = null;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try { bot = await startBot(process.env.TELEGRAM_BOT_TOKEN); }
    catch (e) { state.lastError = 'bot: ' + e.message; log('bot failed to start (check TELEGRAM_BOT_TOKEN):', e.message); }
  } else log('TELEGRAM_BOT_TOKEN not set: running the website only');

  // 3. Live data now and every hour.
  await refresh();
  setInterval(refresh, REFRESH_MIN * 60e3);

  const stop = () => { log('stopping'); if (bot) bot.stop(); server.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

if (require.main === module) main();
module.exports = { refresh, state };
