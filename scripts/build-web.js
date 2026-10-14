/* Builds dist/truecost.html: the web page with the engine, the latest snapshot and its backtest inlined.
   Writes the fragment (for publishing as an artifact) and dist/index.html (a full document for any static host). */
const fs = require('fs'), path = require('path');
const WebPage = require('../src/webpage'), load = require('./load-web-snapshot');
const { file, web } = load(), { html, forecasts } = WebPage.build(web), root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'truecost.html'), html);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), WebPage.documentFor(html));
console.log(`built dist/truecost.html and dist/index.html from ${path.relative(root, file)} (${forecasts} backtest forecasts, ${(html.length / 1024).toFixed(0)} KB)`);
