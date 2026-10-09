// Records a Verth demo video: node record.cjs <scam|org> <en|hi>
// Scenes come from scripts/<video>.json; narration lengths from out/<video>-<lang>/durations.json.
const { chromium } = require('/home/claude/verth/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [video, lang] = process.argv.slice(2);
const OUT = path.join(__dirname, 'out', `${video}-${lang}`);
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'scripts', video + '.json'), 'utf8'));
const dur = JSON.parse(fs.readFileSync(path.join(OUT, 'durations.json'), 'utf8'));
const BASE = 'http://127.0.0.1:8800/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (s, k) => (s[k][lang + '_cap'] ?? s[k][lang]);

const LAYOUT = {
  scam: { phones: [['a', lang === 'hi' ? 'आशा का फ़ोन' : 'Asha’s phone', '1']], pw: 780, h1: 64, capsize: lang === 'hi' ? 31 : 32 },
  org: { phones: [['adm', lang === 'hi' ? 'राजेश · CEO (एडमिन)' : 'Rajesh · CEO (admin)', '1'], ['emp', lang === 'hi' ? 'प्रिया · अकाउंट्स' : 'Priya · Accounts', '1']], pw: 600, h1: 52, capsize: lang === 'hi' ? 26 : 27 },
}[video];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: OUT, size: { width: 1600, height: 900 } } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
  const tStart = Date.now();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const q = new URLSearchParams({ lang, phones: LAYOUT.phones.map((p) => p.join('|')).join(','), pw: LAYOUT.pw, h1: LAYOUT.h1, capsize: LAYOUT.capsize });
  await page.goto(BASE + 'stage.html?' + q);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const first = scenes[0];
  await page.evaluate(([h, p]) => window.stage.cover(true, h, p), [T(first, 'title'), '']);
  const F = (name) => page.frame({ name });
  for (const [name] of LAYOUT.phones) { await page.waitForFunction((n) => !!window.frames[n] && window.frames[n].document.readyState === 'complete', name); }
  await sleep(800);

  /* ---------- helpers ---------- */
  async function tap(frame, selector, { click = true, nth = 0 } = {}) {
    const loc = frame.locator(selector).nth(nth);
    await loc.waitFor({ state: 'visible', timeout: 20000 });
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await page.evaluate(([x, y]) => window.stage.ripple(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
    await sleep(260);
    if (click) await loc.click();
    await sleep(200);
  }
  async function type(frame, selector, text, delay = 45) {
    await tap(frame, selector);
    await frame.locator(selector).pressSequentially(text, { delay });
  }
  async function paste(frame, selector, text) {
    await tap(frame, selector);
    await frame.locator(selector).fill(text);
    await sleep(300);
  }
  async function scroll(frame, selector, block = 'start') {
    await frame.locator(selector).first().evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block).catch(() => {});
    await sleep(700);
  }
  async function scrollBy(frame, y) { await frame.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), y); await sleep(700); }
  async function googleSignIn(frame, email, name) {
    await frame.evaluate(([e, n]) => { window.__googleEmail = e; window.__googleName = n; }, [email, name]);
    await frame.click('text=Continue with Google');
  }
  async function fakefs(mut) {
    await page.evaluate((src) => {
      const db = JSON.parse(localStorage.getItem('fakefs') || '{}');
      (new Function('db', src))(db);
      localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x');
    }, mut);
  }
  const bubbleFake = lang === 'hi'
    ? '<div class="hd"><i>R</i>Rajesh Sir · नया नंबर</div><div class="bd">मैं बोर्ड मीटिंग में हूँ, बात नहीं कर सकता। 3 बजे से पहले Sharma Traders को ₹4,80,000 भेज दो। किसी को बताना मत।<small>11:42</small></div><div class="warn">⚠ नया नंबर, बॉस की फ़ोटो</div>'
    : '<div class="hd"><i>R</i>Rajesh Sir · new number</div><div class="bd">I’m in a board meeting, can’t talk. Transfer ₹4,80,000 to Sharma Traders before 3 pm. Keep this between us.<small>11:42</small></div><div class="warn">⚠ New number using the boss’s photo</div>';

  /* ---------- setup (hidden behind the cover, trimmed from the video) ---------- */
  let inviteCode = '';
  if (video === 'scam') {
    const a = F('a');
    await googleSignIn(a, 'asha@example.in', 'Asha Verma');
    await a.click('text=Skip the tour');
    await a.click('text=Just check something suspicious');
    await a.locator('.kinds').waitFor();
    // Asha is on the Personal plan so the demo isn't stopped by the free limit.
    await fakefs("for (const k in db) if (k.startsWith('users/') && k.split('/').length === 2 && db[k].email === 'asha@example.in') db[k].plan = 'personal';");
    await a.goto(a.url());
    await a.locator('.kinds').waitFor({ timeout: 20000 });
    // warm up the picture reader so the photo scene runs at real speed
    await a.evaluate(async () => { const m = await import('/assets/ocr/imagecheck.js'); const b = await (await fetch('/fixtures/scam-sms.png')).blob(); await m.readImage(b); });
    await a.evaluate(() => window.scrollTo(0, 0));
    await a.addStyleTag({ content: '.vh-fab{display:none!important}' });
  } else {
    const adm = F('adm'), emp = F('emp');
    await googleSignIn(adm, 'rajesh@nirmaan.in', 'Rajesh Mehta');
    await adm.click('text=Skip the tour');
    await adm.locator('text=My organisation').first().waitFor();
    await emp.locator('text=Continue with Google').waitFor();
    for (const fr of [adm, emp]) await fr.addStyleTag({ content: '.vh-fab{display:none!important}' });
  }

  /* ---------- scenes ---------- */
  const A = {
    scam: {
      async intro() { await sleep(1700); await page.evaluate(() => window.stage.cover(false)); },
      async tiles() {
        const a = F('a');
        await scroll(a, '.kinds', 'center');
        for (const k of ['Photo or screenshot', 'Job or exam offer', 'Link', 'Phone number']) { await tap(a, `.kind:has-text("${k}")`, { click: false }); await sleep(420); }
        await tap(a, '.kind:has-text("Message or email")');
      },
      async message() {
        const a = F('a');
        await paste(a, '#s-message', 'Dear Customer, your SBI YONO account will be blocked today. Update your PAN KYC immediately: http://sbi-yono-kyc.xyz/update');
        await tap(a, 'button:has-text("Check it")');
        await a.locator('#scan-result').waitFor();
        await scroll(a, '#scan-result');
        await sleep(2600); await scrollBy(a, 260);
      },
      async job() {
        const a = F('a');
        await tap(a, 'text=Check something else');
        await tap(a, '.kind:has-text("Job or exam offer")');
        await paste(a, '#s-job', 'From: TCS Recruitment <hr.tcs.careers@gmail.com>\nCongratulations! You have been shortlisted for the TCS online exam. Pay the refundable exam fee of Rs 1500 to confirm your slot: https://tcs-careers-india.in/slot');
        await type(a, '#s-company', 'TCS', 70);
        await tap(a, 'button:has-text("Check it")');
        await a.locator('#scan-result').waitFor();
        await scroll(a, '#scan-result');
        await sleep(2200); await scroll(a, '.company', 'center');
      },
      async photo() {
        const a = F('a');
        await tap(a, 'text=Check something else');
        await tap(a, '.kind:has-text("Photo or screenshot")');
        await tap(a, '.drop', { click: false });
        await a.setInputFiles('#s-image', '/home/claude/media/site/fixtures/qr-cashback.png');
        await a.locator('.photo-pick img').waitFor(); await sleep(900);
        await tap(a, 'button:has-text("Check it")');
        await a.locator('#scan-result').waitFor({ timeout: 30000 });
        await scroll(a, '#scan-result');
        await sleep(2600); await scroll(a, '.found', 'center');
      },
      async phone() {
        const a = F('a');
        await tap(a, 'text=Check something else');
        await tap(a, '.kind:has-text("Phone number")');
        await type(a, '#s-phone', '+91 140 123 4567', 55);
        await tap(a, 'button:has-text("Check it")');
        await a.locator('#scan-result').waitFor();
        await scroll(a, '#scan-result');
      },
      async helper() {
        const a = F('a');
        await a.addStyleTag({ content: '.vh-fab{display:inline-flex!important}' });
        await sleep(300);
        await tap(a, '.vh-fab');
        await sleep(2400);
        await tap(a, '.vh-act:has-text("How do I use Verth")');
      },
      async outro(s) {
        await F('a').click('.vh-x').catch(() => {});
        await page.evaluate(([h, p, u]) => window.stage.cover(true, h, p, u), [T(s, 'title'), T(s, 'say'), 'verth.in']);
      },
    },
    org: {
      async intro() { await sleep(2200); await page.evaluate(() => window.stage.cover(false)); },
      async create() {
        const adm = F('adm');
        await tap(adm, 'text=My organisation');
        await type(adm, '#c-name', 'Nirmaan Infra', 50);
        await type(adm, '#c-title', 'CEO', 60);
        await tap(adm, 'button[type=submit]');
        await adm.locator('.invite .mono').waitFor();
        inviteCode = (await adm.locator('.invite .mono').textContent()).trim();
        await scroll(adm, '.invite', 'center');
      },
      async share() {
        const adm = F('adm');
        await tap(adm, 'text=Copy invite message');
        const msg = lang === 'hi'
          ? `<div class="hd"><i>N</i>Nirmaan Infra · ऑफ़िस ग्रुप</div><div class="bd"><b>Rajesh:</b> हमारे Verth सर्कल “Nirmaan Infra” से जुड़ें। ऐप खोलें और कोड डालें <b>${inviteCode}</b><small>10:05</small></div>`
          : `<div class="hd"><i>N</i>Nirmaan Infra · Office group</div><div class="bd"><b>Rajesh:</b> Join our Verth circle “Nirmaan Infra”. Open the app and enter code <b>${inviteCode}</b><small>10:05</small></div>`;
        await page.evaluate(([h]) => window.stage.bubble(h, 150, 600), [msg]);
      },
      async join() {
        const emp = F('emp');
        await tap(emp, 'text=Continue with Google', { click: false });
        await googleSignIn(emp, 'priya@nirmaan.in', 'Priya Nair');
        await tap(emp, 'text=Skip the tour');
        await tap(emp, 'text=I have an invite code');
        await type(emp, '#j-code', inviteCode.replace('-', ''), 70);
        await type(emp, '#j-title', 'Accounts', 55);
        await tap(emp, 'button[type=submit]');
        await page.evaluate(() => window.stage.bubble(''));
        await emp.getByRole('heading', { name: 'Waiting for approval' }).waitFor();
      },
      async approve() {
        const adm = F('adm');
        await adm.getByRole('heading', { name: 'Waiting for your approval' }).waitFor({ timeout: 15000 });
        await scroll(adm, 'button:has-text("Approve")', 'center');
        await sleep(900);
        await tap(adm, 'button:has-text("Approve")');
        await F('emp').locator('nav.tabs').waitFor({ timeout: 15000 });
      },
      async fake() {
        const emp = F('emp');
        await page.evaluate(([h]) => window.stage.bubble(h, 150, 560), [bubbleFake]);
        await sleep(2600);
        await tap(emp, 'nav >> text=Verify');
        await emp.selectOption('#v-channel', 'WhatsApp');
        await type(emp, '#v-what', 'pay ₹4,80,000 to Sharma Traders', 40);
        await tap(emp, 'button:has-text("Send check")');
      },
      async deny() {
        const adm = F('adm'), emp = F('emp');
        await tap(adm, 'nav >> text=Home');
        await adm.locator('.incoming').waitFor({ timeout: 15000 });
        await sleep(1400);
        await tap(adm, 'text=No, not me');
        await page.evaluate(() => window.stage.bubble(''));
        await emp.getByRole('heading', { name: /didn’t send this/ }).waitFor({ timeout: 15000 });
        await scroll(emp, '.result', 'center');
      },
      async code() {
        const adm = F('adm'), emp = F('emp');
        await scroll(adm, '[data-mycode]', 'center');
        await adm.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector('[data-mycode]')?.textContent || ''));
        await tap(adm, '[data-mycode]', { click: false });
        await tap(emp, 'text=New check').catch(() => {});
        await tap(emp, '.seg >> text=Check a code');
        const real = (await adm.locator('[data-mycode]').textContent()).trim();
        await type(emp, '#v-code', real.replace(' ', ''), 90);
        await tap(emp, 'button:has-text("Check code")');
        await emp.getByRole('heading', { name: 'Code matches' }).waitFor();
        await scroll(emp, '.result', 'center');
      },
      async log() {
        const adm = F('adm');
        await tap(adm, 'nav >> text=Log');
        await sleep(2400);
        await tap(adm, 'nav >> text=Circle');
        await sleep(600); await scroll(adm, 'text=Change code', 'center');
      },
      async outro(s) {
        await page.evaluate(([h, p, u]) => window.stage.cover(true, h, p, u), [T(s, 'title'), T(s, 'say'), 'verth.in']);
      },
    },
  }[video];

  const timeline = [];
  const t0 = Date.now();
  for (const s of scenes) {
    const start = Date.now();
    await page.evaluate(([k, t, c]) => window.stage.scene(k, t, c), [T(s, 'kicker'), T(s, 'title'), T(s, 'say')]);
    timeline.push({ id: s.id, at: (start - t0) / 1000 });
    const need = (dur[s.id] + 0.55) * 1000;
    try { await A[s.id](s); } catch (e) { console.log('scene', s.id, 'failed:', e.message.split('\n')[0]); }
    const left = need - (Date.now() - start);
    if (left > 0) await sleep(left);
    console.log(s.id, ((Date.now() - start) / 1000).toFixed(1) + 's (voice ' + dur[s.id] + 's)');
  }
  await sleep(1200);
  const total = (Date.now() - t0) / 1000;
  const vpath = await page.video().path();
  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ offset: (t0 - tStart) / 1000, total, scenes: timeline, raw: vpath }, null, 1));
  console.log('done', total.toFixed(1) + 's', vpath);
})();
