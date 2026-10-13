/* Bot command handlers, independent of Telegram so they can be tested. Each returns the reply text. */
const F = require('./format');
const { fetchPositions, evaluate } = require('./monitor');

const WALLET = /^0x[0-9a-fA-F]{40}$/;

function makeCommands(ctx) {
  // ctx: { engine(), snapshot(), store, calibration, api }
  return {
    async start() { return F.help(); },
    async help() { return F.help(); },
    async cost(chatId, text) {
      const E = ctx.engine(); if (!E) return 'Still loading market data. Try again in a minute.';
      const inp = E.parseCost(text); if (inp.error) return inp.error;
      const { text: msg, quotes } = F.cost(E, inp, ctx.snapshot().asOf);
      // Log the funding forecast behind every answer so /record covers what people were actually told.
      const start = Date.parse(ctx.snapshot().asOf);
      ctx.calibration.add(['hl', 'lt'].filter(v => quotes[v].ok).map(v => {
        const f = E.funding(inp.sym, v, 1, 1, inp.hours);
        return { id: `${inp.sym}|${v}|${inp.hours}|${start}|asked`, sym: inp.sym, v, hours: inp.hours, start, p10: f.p10, p50: f.median, p90: f.p90, kind: 'asked' };
      }));
      return msg;
    },
    async watch(chatId, text) {
      const addr = (text.split(/\s+/)[1] || '').trim();
      if (!WALLET.test(addr)) return 'Send your wallet address after the command, like:\n/watch 0x1234…abcd (the full 42-character address)';
      const u = ctx.store.user(chatId);
      if (!u.wallets.includes(addr.toLowerCase())) u.wallets.push(addr.toLowerCase());
      if (u.wallets.length > 5) return 'You can watch up to 5 wallets. Send /unwatch to start over.';
      ctx.store.saveUser(chatId, u);
      return `Watching ${F.short(addr)}. I only read it.\n\n` + await this.positions(chatId);
    },
    async unwatch(chatId) { const u = ctx.store.user(chatId); u.wallets = []; ctx.store.saveUser(chatId, u); return 'Done. I\'ve forgotten your wallets and won\'t send warnings.'; },
    async positions(chatId) {
      const E = ctx.engine(), u = ctx.store.user(chatId);
      if (!u.wallets.length) return 'I\'m not watching any wallet yet. Send /watch 0xYourWallet';
      if (!E) return 'Still loading market data. Try again in a minute.';
      const { raw, errors } = await fetchPositions(u.wallets, ctx.api);
      const { ps, skipped } = evaluate(E, raw);
      return F.positions(ps, skipped, u.alertPct / 100) + (errors.length ? `\n\nCouldn't reach: ${[...new Set(errors.map(e => e.split(':')[0]))].join(', ')}. I'll retry.` : '');
    },
    async alert(chatId, text) {
      const n = parseFloat(text.split(/\s+/)[1]);
      if (!(n >= 1 && n <= 50)) return 'Send a percentage between 1 and 50, like /alert 8';
      const u = ctx.store.user(chatId); u.alertPct = n; u.alertsOn = true; ctx.store.saveUser(chatId, u);
      return `Done. I'll message you when any position is within ${n}% of its liquidation price.`;
    },
    async alerts(chatId, text) {
      const on = /\bon\b/i.test(text), off = /\boff\b/i.test(text);
      if (!on && !off) return 'Send /alerts off to pause warnings, or /alerts on to resume.';
      const u = ctx.store.user(chatId); u.alertsOn = on; ctx.store.saveUser(chatId, u);
      return on ? 'Warnings are on.' : 'Warnings paused. Send /alerts on to resume.';
    },
    async record() { return F.record(ctx.calibration.stats('daily')); }
  };
}
module.exports = { makeCommands, WALLET };
