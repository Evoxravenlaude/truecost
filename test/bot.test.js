/* Drives the real grammY bot with fake Telegram updates and captures every API call (no network). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { Bot, InputFile } = require('grammy');
const TrueCost = require('../src/engine');
const WebPage = require('../src/webpage');
const Store = require('../src/store');
const { Calibration } = require('../src/calibration');
const BotUI = require('../src/bot');
const { makeUI, enc, dec } = require('../src/ui');

const snap = WebPage.decode(WebPage.sample()), E = TrueCost.create(snap);
const WALLET = '0x' + 'ab'.repeat(20);
function setup() {
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'tcbot-'))), calibration = new Calibration(store), asked = [];
  const api = { hl: { positions: async () => [{ venue: 'hl', coin: 'ETH', side: 'long', size: 4, entry: 2400, notional: 9600, margin: 1920, lev: 5, liq: 1950, mode: 'isolated' }] }, lt: { positions: async () => [] } };
  const deps = { engine: () => E, snapshot: () => snap, store, calibration, site: () => 'truecost.test', appUrl: () => 'https://truecost.test', backtest: () => ({ n: 10, rate: 0.8, byH: { 24: { n: 10, rate: 0.8 } }, byCoin: [{ sym: 'BTC', n: 10, rate: 0.8 }] }), api, logAsked: i => asked.push(i) };
  const bot = new Bot('123:TEST', { botInfo: { id: 1, is_bot: true, first_name: 'TrueCost', username: 'TrueCostTestBot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false } });
  const calls = []; let mid = 100;
  bot.api.config.use((prev, method, payload) => {
    calls.push({ method, payload });
    const msg = { message_id: ++mid, date: 0, chat: { id: 42, type: 'private' } };
    if (method === 'sendPhoto') msg.photo = [{ file_id: 'f', file_unique_id: 'u', width: 1, height: 1 }];
    if (method === 'sendMessage') msg.text = payload.text;
    return Promise.resolve({ ok: true, result: /^(send|edit)/.test(method) ? msg : true });
  });
  BotUI.attach(bot, deps, () => {});
  let uid = 0;
  const from = { id: 42, is_bot: false, first_name: 'Sage' }, chat = { id: 42, type: 'private' };
  const say = text => bot.handleUpdate({ update_id: ++uid, message: { message_id: ++mid, date: 0, chat, from, text, entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : undefined } });
  const tap = (data, onPhoto) => bot.handleUpdate({ update_id: ++uid, callback_query: { id: 'q' + uid, from, chat_instance: 'c', data, message: Object.assign({ message_id: 7, date: 0, chat }, onPhoto ? { photo: [{ file_id: 'f', file_unique_id: 'u', width: 1, height: 1 }] } : { text: 'x' }) } });
  return { bot, calls, say, tap, store, asked };
}
const last = (calls, m) => calls.filter(c => !m || c.method === m).slice(-1)[0];
function keyboards(calls) { return calls.flatMap(c => ((c.payload.reply_markup || {}).inline_keyboard || []).flat()); }

test('state survives the 64-byte callback limit for every coin', () => {
  for (const m of snap.markets) {
    const s = { sym: m.sym, side: 'short', margin: 10000000, lev: 50, hours: 336, order: 'maker', g: 'e' };
    const data = 'res|' + enc(s) + '|20'; assert.ok(Buffer.byteLength(data) <= 64, data);
    assert.deepStrictEqual(Object.assign(dec(enc(s)), { acct: undefined }), Object.assign({}, s, { acct: undefined }));
  }
});

test('every screen renders for every coin, within Telegram limits', async () => {
  const { store } = setup();
  const ui = makeUI({ engine: () => E, snapshot: () => snap, store, calibration: new Calibration(store), site: () => 's', appUrl: () => 'https://s', backtest: () => ({ n: 0, rate: 0, byH: {}, byCoin: [] }) });
  for (const m of snap.markets) for (const lev of [1, 5, 50]) {
    const s = dec(`${m.sym}.l.1000.${lev}.72.t.a`);
    for (const v of [ui.step1(s), ui.step2(s), ui.step3(s), ui.step4(s), ui.result(s), ui.roll(s, Math.random)]) {
      assert.ok(v.text.length <= (v.kind === 'photo' ? 1024 : 4096), `${m.sym} ${lev}x ${v.kind} ${v.text.length}`);
      if (v.kind === 'photo') assert.ok(Buffer.isBuffer(v.photo) && v.photo.length > 10000);
      v.kb.flat().forEach(b => b.callback_data && assert.ok(Buffer.byteLength(b.callback_data) <= 64, b.callback_data));
    }
  }
  assert.match(ui.record().text, /track-record/);
});

test('full flow through the bot', async () => {
  const { calls, say, tap, store, asked } = setup();
  await say('/start');
  let c = last(calls, 'sendPhoto'); assert.match(c.payload.caption, /TrueCost OS/); assert.ok(c.payload.photo instanceof InputFile);
  assert.ok(keyboards([c]).some(b => b.web_app && b.web_app.url === 'https://truecost.test'));

  await tap('w1|' + enc(dec('')), true);            // from the photo menu to a text step: replaces the message
  assert.ok(calls.some(x => x.method === 'deleteMessage')); assert.match(last(calls, 'sendMessage').payload.text, /01 \/ 04/);
  await tap('w2|' + enc(dec('SOL')));              assert.match(last(calls, 'editMessageText').payload.text, /Up or down on SOL/);
  await tap('w3|' + enc(dec('SOL.l.1000.10')));    assert.match(last(calls, 'editMessageText').payload.text, /Room before wipe-out[\s\S]*■/);
  await tap('am|' + enc(dec('SOL.l.1000.10')));    assert.ok(last(calls, 'sendMessage').payload.reply_markup.force_reply);
  await say('750');                                assert.match(last(calls, 'sendMessage').payload.text, /\$750/);
  await tap('w4|' + enc(dec('SOL.l.750.10')));     assert.match(last(calls, 'editMessageText').payload.text, /How long/);
  await tap('res|' + enc(dec('SOL.l.750.10.168'))); c = last(calls, 'sendPhoto'); assert.match(c.payload.caption, /SOL up · \$750 at 10× · 1 week/);
  await tap('res|' + enc(dec('SOL.l.750.5.168')), true); c = last(calls, 'editMessageMedia'); assert.match(c.payload.media.caption, /at 5×/);
  await tap('roll|' + enc(dec('SOL.l.750.5.168')), true); assert.match(last(calls, 'sendPhoto').payload.caption, /Wiped out|Survived/);
  await tap('rr|' + enc(dec('SOL.l.750.5.168')), true); assert.match(last(calls, 'editMessageMedia').payload.media.caption, /Wiped out|Survived/);

  await say('/cost ETH long 25k 5x 3d');           assert.match(last(calls, 'sendPhoto').payload.caption, /ETH up · \$5,000 at 5× · 3 days/); assert.strictEqual(asked.length, 1);
  await say('/cost nonsense');                     assert.match(last(calls, 'sendMessage').payload.text, /\/check/);

  await say('/watch');                             assert.ok(last(calls, 'sendMessage').payload.reply_markup.force_reply);
  await say(WALLET);                               assert.match(last(calls, 'sendPhoto').payload.caption, /ETH<\/b> up 5×/);
  assert.deepStrictEqual(store.user('42').wallets, [WALLET]);
  await tap('wl|x|12', true);                      assert.strictEqual(store.user('42').alertPct, 12); assert.match(last(calls, 'editMessageMedia').payload.media.caption, /12%/);
  await tap('wt|x', true);                         assert.strictEqual(store.user('42').alertsOn, false);
  await tap('wf|x', true);                         assert.deepStrictEqual(store.user('42').wallets, []); assert.match(last(calls, 'sendMessage').payload.text, /forgotten/);

  await say('/record');                            assert.match(last(calls, 'sendPhoto').payload.caption, /track-record/);
  await say('/alert 9');                           assert.strictEqual(store.user('42').alertPct, 9);
  await say('hello');                              assert.match(last(calls, 'sendPhoto').payload.caption, /TrueCost OS/);
  await say('/nope');                              assert.match(last(calls, 'sendMessage').payload.text, /\/menu/);
  for (const b of keyboards(calls)) if (b.callback_data) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
  assert.ok(!calls.some(x => x.method === 'sendMessage' && /went wrong/.test(x.payload.text)), 'no handler errors');
});

test('alert messages show the room bar', () => {
  const ui = makeUI({ engine: () => E, snapshot: () => snap, store: null, calibration: null, site: () => '', appUrl: () => '', backtest: () => null });
  const p = E.position({ sym: 'ETH', v: 'hl', side: 'long', entry: 2600, notional: 26000, lev: 10, liq: 2450 }, E.market('ETH').px);
  const a = E.alerts([p], 0.08).find(x => x.kind === 'room' || x.level === 'critical');
  const m = ui.alertMessage(a); assert.match(m, /ETH up 10× · Hyperliquid/); assert.match(m, /■/);
});
