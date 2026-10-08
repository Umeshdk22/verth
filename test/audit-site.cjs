// Opens every public page on a phone-sized and a laptop-sized screen, scrolls through it, and
// reports page errors, failed downloads and the problems test/audit.cjs finds.
//   node test/audit-site.cjs <base url> <out dir>
const { chromium } = require('playwright');
const { auditPage } = require('./audit.cjs');
const [BASE, OUT] = process.argv.slice(2);
const PAGES = ['index.html', 'join.html?c=ABCD2345&by=Umesh&n=Sharma%20Family&t=family', 'join.html?c=ABCD2345&by=Umesh&n=Nirmaan&t=org&d=nirmaan.in', 'demo.html', 'pricing.html', 'contact.html', 'privacy.html', 'terms.html', 'refunds.html', 'shipping.html', '404.html'];
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const report = {};
  for (const [vw, vh, tag] of [[390, 844, 'phone'], [1440, 900, 'laptop']]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('verth-splash', '1'); } catch (e) {} });
    for (const path of PAGES) {
      const p = await ctx.newPage(), errs = [];
      p.on('pageerror', (e) => errs.push('error: ' + e.message));
      p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
      p.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });
      p.on('requestfailed', (r) => { const u = r.url(); if (u.startsWith(BASE) && !/\.mp4/.test(u)) errs.push('failed ' + u.replace(BASE, '')); });
      await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch((e) => errs.push('load: ' + e.message.split('\n')[0]));
      // scroll through so lazy pictures and animations show
      const h = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += vh * 0.8) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(120); }
      await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400);
      const a = await auditPage(p);
      const name = `${tag}-${path.split('?')[0].replace('.html', '')}${path.includes('d=') ? '-org' : ''}`;
      await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      report[name] = { errors: errs, ...a };
      console.log(name, errs.length + a.issues.length ? `${errs.length} errors, ${a.issues.length} issues` : 'ok', '| fonts:', a.fonts.join(', '));
      for (const e of errs) console.log('   ', e);
      for (const i of a.issues) console.log('   ', i.kind, i.detail);
      await p.close();
    }
    await ctx.close();
  }
  require('node:fs').writeFileSync(`${OUT}/audit.json`, JSON.stringify(report, null, 1));
  await b.close();
})();
