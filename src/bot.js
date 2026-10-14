/* Wires the UI to Telegram (grammY): commands, button taps, typed replies, menu button and profile text. */
const { InputFile } = require('grammy');
const { makeUI } = require('./ui');

const CAPTION_MAX = 1024;
function fitCaption(html) {
  if (html.length <= CAPTION_MAX) return html;
  const noQuote = html.replace(/\n?<blockquote>[\s\S]*?<\/blockquote>/, '');
  return noQuote.length <= CAPTION_MAX ? noQuote : noQuote.slice(0, CAPTION_MAX - 1).replace(/<[^>]*$/, '') + '…';
}

function attach(bot, deps, log) {
  const ui = makeUI(deps), pending = new Map(); // chatId -> { type: 'amount'|'wallet', s }
  const ready = () => !!deps.engine();
  const notReady = c => c.reply('Still loading market data. Try again in a minute.');

  async function send(c, v) {
    const markup = v.forceReply ? { force_reply: true, input_field_placeholder: v.forceReply } : { inline_keyboard: v.kb || [] };
    if (v.kind === 'photo') return c.replyWithPhoto(new InputFile(v.photo, 'truecost.png'), { caption: fitCaption(v.text), parse_mode: 'HTML', reply_markup: markup });
    return c.reply(v.text, { parse_mode: 'HTML', reply_markup: markup, link_preview_options: { is_disabled: true } });
  }
  async function edit(c, v) {
    const msg = c.callbackQuery && c.callbackQuery.message, cur = msg && msg.photo ? 'photo' : 'text';
    if (!msg || v.forceReply || cur !== v.kind) { if (msg) await c.deleteMessage().catch(() => {}); return send(c, v); }
    const reply_markup = { inline_keyboard: v.kb || [] };
    try {
      if (v.kind === 'photo') await c.editMessageMedia({ type: 'photo', media: new InputFile(v.photo, 'truecost.png'), caption: fitCaption(v.text), parse_mode: 'HTML' }, { reply_markup });
      else await c.editMessageText(v.text, { parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
    } catch (e) { if (!/not modified/i.test(e.message)) throw e; }
  }
  const chat = c => String(c.chat.id);
  const guard = fn => async c => { try { await fn(c); } catch (e) { log('bot handler failed:', e.message); await c.reply('Something went wrong on my side. Try again in a minute.').catch(() => {}); } };

  /* ---------- commands ---------- */
  bot.command(['start', 'help', 'menu'], guard(async c => { if (!ready()) return notReady(c); await send(c, ui.home()); }));
  bot.command('cost', guard(async c => {
    if (!ready()) return notReady(c);
    const E = deps.engine(), inp = E.parseCost(c.message.text || '');
    if (inp.error) { await c.reply(inp.error + '\n\nOr tap through it: /check'); return; }
    await send(c, ui.result(ui.dec([inp.sym, inp.side === 'short' ? 's' : 'l', Math.max(20, Math.round(inp.notional / inp.lev)), inp.lev, inp.hours, 't', 'a'].join('.'))));
    deps.logAsked && deps.logAsked(inp);
  }));
  bot.command('check', guard(async c => { if (!ready()) return notReady(c); await send(c, ui.step1(ui.dec(''))); }));
  bot.command(['watch', 'positions'], guard(async c => {
    if (!ready()) return notReady(c);
    const addr = (c.message.text || '').split(/\s+/)[1];
    if (addr) {
      if (!ui.WALLET.test(addr)) { await c.reply('That doesn\'t look like a wallet address: 0x followed by 40 letters and numbers.'); return; }
      const u = deps.store.user(chat(c)); if (!u.wallets.includes(addr.toLowerCase())) u.wallets.push(addr.toLowerCase()); u.wallets = u.wallets.slice(-5); deps.store.saveUser(chat(c), u);
    }
    const v = await ui.watch(chat(c)); if (v.forceReply) pending.set(chat(c), { type: 'wallet' }); await send(c, v);
  }));
  bot.command('unwatch', guard(async c => { const u = deps.store.user(chat(c)); u.wallets = []; deps.store.saveUser(chat(c), u); await c.reply('Done. I\'ve forgotten your wallets and won\'t send warnings.'); }));
  bot.command('alert', guard(async c => {
    const n = parseFloat((c.message.text || '').split(/\s+/)[1]);
    if (!(n >= 1 && n <= 50)) { await c.reply('Send a percentage between 1 and 50, like /alert 8'); return; }
    const u = deps.store.user(chat(c)); u.alertPct = n; u.alertsOn = true; deps.store.saveUser(chat(c), u);
    await c.reply(`Done. I'll message you when a position is within <b>${n}%</b> of liquidation.`, { parse_mode: 'HTML' });
  }));
  bot.command('alerts', guard(async c => {
    const t = c.message.text || '', on = /\bon\b/i.test(t), off = /\boff\b/i.test(t);
    if (!on && !off) { await c.reply('Send /alerts off to pause warnings, or /alerts on to resume.'); return; }
    const u = deps.store.user(chat(c)); u.alertsOn = on; deps.store.saveUser(chat(c), u); await c.reply(on ? 'Warnings are on.' : 'Warnings paused. Send /alerts on to resume.');
  }));
  bot.command('record', guard(async c => { if (!ready()) return notReady(c); await send(c, ui.record()); }));
  bot.command('how', guard(async c => { await send(c, ui.how()); }));

  /* ---------- button taps ---------- */
  bot.on('callback_query:data', guard(async c => {
    const [action, state, extra] = c.callbackQuery.data.split('|');
    if (action === 'noop') return c.answerCallbackQuery();
    if (!ready()) return c.answerCallbackQuery({ text: 'Still loading market data. Try again in a minute.' });
    const s = ui.dec(state), id = chat(c);
    await c.answerCallbackQuery();
    switch (action) {
      case 'home': return edit(c, ui.home());
      case 'w1': return edit(c, ui.step1(s));
      case 'w2': return edit(c, ui.step2(s));
      case 'w3': return edit(c, ui.step3(s));
      case 'w4': return edit(c, ui.step4(s));
      case 'res': return edit(c, ui.result(s));
      case 'roll': return send(c, ui.roll(s));
      case 'rr': return edit(c, ui.roll(s));
      case 'am': pending.set(id, { type: 'amount', s }); return c.reply('How much of your money? Send a dollar amount, like 750.', { reply_markup: { force_reply: true, input_field_placeholder: 'e.g. 750' } });
      case 'wa': case 'wn': { const v = await ui.watch(id); if (v.forceReply) pending.set(id, { type: 'wallet' }); return action === 'wn' ? send(c, v) : edit(c, v); }
      case 'wr': return edit(c, await ui.watch(id));
      case 'wt': { const u = deps.store.user(id); u.alertsOn = !u.alertsOn; deps.store.saveUser(id, u); return edit(c, await ui.watch(id)); }
      case 'wl': { const u = deps.store.user(id); u.alertPct = Math.max(1, Math.min(50, +extra || 8)); u.alertsOn = true; deps.store.saveUser(id, u); return edit(c, await ui.watch(id)); }
      case 'wf': { const u = deps.store.user(id); u.wallets = []; deps.store.saveUser(id, u); return edit(c, { kind: 'text', text: 'Done. I\'ve forgotten your wallets and won\'t send warnings.', kb: [[{ text: '‹ Menu', callback_data: 'home' }]] }); }
      case 'rec': return edit(c, ui.record());
      case 'how': return edit(c, ui.how());
      default: return undefined;
    }
  }));

  /* ---------- typed replies (amounts, wallet addresses) ---------- */
  bot.on('message:text', guard(async c => {
    const t = (c.message.text || '').trim(), id = chat(c), p = pending.get(id);
    if (t.startsWith('/')) { await c.reply('I don\'t know that one. Send /menu to see everything.'); return; }
    if (!ready()) return notReady(c);
    if (p && p.type === 'amount') {
      const n = Math.round(parseFloat(t.replace(/[$,\s]/g, '').replace(/k$/i, '000')));
      if (!(n >= 20 && n <= 10000000)) { await c.reply('Send an amount between $20 and $10,000,000, like 750.'); return; }
      pending.delete(id); return send(c, ui.step3(Object.assign(p.s, { margin: n })));
    }
    if ((p && p.type === 'wallet') || ui.WALLET.test(t)) {
      if (!ui.WALLET.test(t)) { await c.reply('That doesn\'t look like a wallet address: 0x followed by 40 letters and numbers.'); return; }
      pending.delete(id); const u = deps.store.user(id); if (!u.wallets.includes(t.toLowerCase())) u.wallets.push(t.toLowerCase()); u.wallets = u.wallets.slice(-5); deps.store.saveUser(id, u);
      return send(c, await ui.watch(id));
    }
    await send(c, ui.home());
  }));

  return { ui };
}

/* Profile text, command list and the menu button that opens the website inside Telegram. */
async function setupProfile(bot, appUrl, log) {
  const api = bot.api, quiet = p => p.catch(e => log('profile setup:', e.message));
  await quiet(api.setMyCommands([
    { command: 'menu', description: 'TrueCost OS menu' },
    { command: 'check', description: 'Check a trade, step by step' },
    { command: 'cost', description: 'Quick check: /cost ETH long 25k 5x 3d' },
    { command: 'watch', description: 'Watch my wallet (read-only)' },
    { command: 'record', description: 'How often the forecasts were right' },
    { command: 'how', description: 'Where every number comes from' }
  ]));
  await quiet(api.setMyShortDescription('Know what a perp trade really costs before you place it. Hyperliquid + Lighter. Read-only.'));
  await quiet(api.setMyDescription('TrueCost OS checks a leveraged trade on Hyperliquid or Lighter before you place it: fees to get in and out, the holding fee as a likely range, and the price that wipes you out. It watches your wallet (read-only) and warns you before liquidation. Press Start.'));
  if (appUrl) await quiet(api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'TrueCost OS', web_app: { url: appUrl } } }));
}

module.exports = { attach, setupProfile, fitCaption };
