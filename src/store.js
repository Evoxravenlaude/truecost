/* Tiny JSON-file store. One file per collection, written atomically. Fine for thousands of users;
   swap for Postgres/Supabase when that stops being true. */
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); this.cache = {}; }
  file(name) { return path.join(this.dir, name + '.json'); }
  read(name, fallback) {
    if (name in this.cache) return this.cache[name];
    try { this.cache[name] = JSON.parse(fs.readFileSync(this.file(name), 'utf8')); } catch (_) { this.cache[name] = fallback; }
    return this.cache[name];
  }
  write(name, value) {
    this.cache[name] = value;
    const f = this.file(name), tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, f);
  }
  /* Users keyed by Telegram chat id: { wallets: [], alertPct, alertsOn, sent: { key: ms } } */
  users() { return this.read('users', {}); }
  user(chatId) { const u = this.users(); return u[chatId] || { wallets: [], alertPct: 8, alertsOn: true, sent: {} }; }
  saveUser(chatId, data) { const u = this.users(); u[chatId] = data; this.write('users', u); }
  removeUser(chatId) { const u = this.users(); delete u[chatId]; this.write('users', u); }
}
module.exports = Store;
