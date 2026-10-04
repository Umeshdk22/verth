// Gives every app file a version stamp from its contents (assets/app.js?v=3f9a2c1d), in the HTML
// pages and in the service worker. A browser can then never mix an old saved file with a new page:
// a changed file has a new address and must be fetched. Runs at the end of `npm run build`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FILES = ['app.js', 'verth.css', 'helper.js', 'site.js', 'splash.js', 'join.js', 'fonts.css', 'demo.js'];
const hash = (f) => createHash('sha256').update(readFileSync('assets/' + f)).digest('hex').slice(0, 10);
const v = Object.fromEntries(FILES.filter((f) => existsSync('assets/' + f)).map((f) => [f, hash(f)]));
const stampAll = (text) => text.replace(/assets\/([a-z]+\.(?:js|css))(\?v=[a-f0-9]+)?(?=["'])/g, (m, f) => (v[f] ? `assets/${f}?v=${v[f]}` : m));

for (const page of ['index.html', 'app.html', 'join.html', '404.html', 'demo.html', 'privacy.html', 'terms.html', 'refunds.html']) {
  if (!existsSync(page)) continue;
  const before = readFileSync(page, 'utf8'), after = stampAll(before);
  if (after !== before) writeFileSync(page, after);
}
const sw = readFileSync('sw.js', 'utf8');
const all = createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 10);
writeFileSync('sw.js', stampAll(sw).replace(/const CACHE = 'verth-shell-[^']*';/, `const CACHE = 'verth-shell-${all}';`));
console.log('stamped', Object.keys(v).length, 'files · cache', all);
