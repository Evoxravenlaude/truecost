/* Loads data/snapshot.web.json if the service has written one, else the bundled sample. Returns [webSnap, engineSnap]. */
const fs = require('fs'), path = require('path');
module.exports = function load() {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const live = path.join(dir, 'snapshot.web.json'), sample = path.join(__dirname, '..', 'web', 'snapshot.sample.json');
  const file = fs.existsSync(live) ? live : sample, web = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dec = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v.map(x => x * web.histUnit)]));
  return { file, web, snap: Object.assign({}, web, { hist: dec(web.histRaw), histHL: dec(web.histHLRaw) }) };
};
