/* TrueCost service: refreshes venue data hourly, runs the Telegram bot, sends position alerts,
   keeps the accuracy log, and writes snapshot files the web page is built from. */
require('./env');
const fs = require('fs');
const path = require('path');
const { Bot } = require('grammy');
const TrueCost = require('./engine');
const Snapshot = require('./snapshot');
const Store = require('./store');
const { Calibration, dailyForecasts } = require('./calibration');
const { makeCommands } = require('./commands');
const { fetchPositions, evaluate, dedupe } = require('./monitor');
const F = require('./format');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const REFRESH_MIN = +process.env.REFRESH_MIN || 60;
const ALERT_MIN = +process.env.ALERT_MIN || 10;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const store = new Store(DATA_DIR), calibration = new Calibration(store);
let snap = null, E = null;

async function refresh() {
  try {
    const s = await Snapshot.build({ log });
    if (!s.markets.length) throw new Error('no markets loaded');
    snap = s; E = TrueCost.create(s);
    s.notes.forEach(n => log('note:', n));
    fs.writeFileSync(path.join(DATA_DIR, 'snapshot.web.json'), JSON.stringify(Snapshot.forWeb(s)));
    const added = new Date(s.asOf).getUTCHours() === 0 || !calibration.log().length ? calibration.add(dailyForecasts(E, s)) : 0;
    const scored = calibration.score(s);
    fs.writeFileSync(path.join(DATA_DIR, 'accuracy.json'), JSON.stringify({ asOf: s.asOf, daily: calibration.stats('daily'), asked: calibration.stats('asked') }));
    log(`snapshot ${s.asOf}: ${s.markets.length} markets, ${added} forecasts logged, ${scored} scored`);
  } catch (e) { log('refresh failed:', e.message); }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.error('Set TELEGRAM_BOT_TOKEN (from @BotFather). See README.'); process.exit(1); }
  await refresh();
  setInterval(refresh, REFRESH_MIN * 60e3);

  const bot = new Bot(token);
  const cmds = makeCommands({ engine: () => E, snapshot: () => snap, store, calibration });
  for (const name of Object.keys(cmds)) {
    bot.command(name, async c => {
      try { await c.reply(await cmds[name](String(c.chat.id), c.message.text || '')); }
      catch (e) { log(`/${name} failed:`, e.message); await c.reply('Something went wrong on my side. Try again in a minute.'); }
    });
  }
  bot.on('message:text', c => c.reply('Send /help to see what I can do.'));
  bot.catch(e => log('bot error:', e.message));
  await bot.api.setMyCommands([
    { command: 'cost', description: 'What a trade costs, e.g. /cost ETH long 25k 5x 3d' },
    { command: 'watch', description: 'Watch a wallet (read-only)' },
    { command: 'positions', description: 'Positions I\'m watching' },
    { command: 'alert', description: 'Warn me within N% of liquidation' },
    { command: 'record', description: 'How accurate the forecasts have been' },
    { command: 'help', description: 'Everything I can do' }
  ]).catch(e => log('setMyCommands failed:', e.message));

  // Alerts loop
  setInterval(async () => {
    if (!E) return;
    const users = store.users();
    for (const [chatId, u] of Object.entries(users)) {
      if (!u.alertsOn || !u.wallets.length) continue;
      try {
        const { raw } = await fetchPositions(u.wallets);
        const { ps } = evaluate(E, raw);
        const fresh = dedupe(E.alerts(ps, u.alertPct / 100), ps, u.sent = u.sent || {});
        if (fresh.length) await bot.api.sendMessage(chatId, fresh.map(F.alertText).join('\n\n'));
        store.saveUser(chatId, u);
      } catch (e) {
        log(`alerts for ${chatId} failed:`, e.message);
        if (/bot was blocked|chat not found/i.test(e.message)) store.removeUser(chatId);
      }
    }
  }, ALERT_MIN * 60e3);

  bot.start({ onStart: me => log(`bot @${me.username} running`) });
  const stop = () => { log('stopping'); bot.stop(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

if (require.main === module) main();
module.exports = { refresh };
