const { chromium } = require('playwright');
const OUT = process.argv[2];
const URL = 'http://127.0.0.1:8765/app.html?emu';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  const errors = [];
  const A = await ctx.newPage(), B = await ctx.newPage();
  for (const [n, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', (e) => errors.push(n + ' pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(n + ' console: ' + m.text()); });
  }
  const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const step = async (msg, fn) => { try { await fn(); console.log('ok  ', msg); } catch (e) { console.log('FAIL', msg, '-', e.message.split('\n')[0]); await shot(A, 'fail-A'); await shot(B, 'fail-B'); throw e; } };

  await A.goto(URL);
  await step('A sees sign in', () => A.getByRole('heading', { name: 'Sign in to Verth' }).waitFor({ timeout: 5000 }));
  await shot(A, '01-signin');
  await step('A signs up', async () => {
    await A.click('text=Create a free account');
    await A.fill('#a-name', 'Rajesh Mehta'); await A.fill('#a-email', 'rajesh@nirmaan.in'); await A.fill('#a-pass', 'password123');
    await A.click('button[type=submit]');
    await A.getByRole('heading', { name: 'Confirm your email' }).waitFor({ timeout: 5000 });
  });
  await shot(A, '02-verify-email');
  await step('A not verified yet is blocked', async () => {
    await A.click('text=I’ve confirmed my email');
    await A.getByText('Not confirmed yet').waitFor({ timeout: 3000 });
  });
  await step('A verifies and sees tour', async () => {
    await A.evaluate(() => window.__fakeVerify('rajesh@nirmaan.in'));
    await A.click('text=I’ve confirmed my email');
    await A.getByRole('heading', { name: 'Welcome to Verth' }).waitFor({ timeout: 5000 });
  });
  await shot(A, '03-tour-1');
  await step('A walks the tour', async () => {
    await A.click('text=Next'); await shot(A, '04-tour-2');
    await A.click('text=Next'); await shot(A, '05-tour-3');
    await A.click('text=Next'); await shot(A, '06-tour-4');
    await A.click('text=My organisation');
    await A.getByRole('heading', { name: 'Set up your organisation' }).waitFor();
  });
  await step('A creates circle', async () => {
    await A.fill('#c-name', 'Nirmaan Infra'); await A.fill('#c-title', 'CEO');
    await A.click('button[type=submit]');
    await A.getByRole('heading', { name: 'Invite people' }).waitFor({ timeout: 5000 });
  });
  await shot(A, '07-circle');
  const code = (await A.locator('.invite .mono').textContent()).trim();
  console.log('invite code', code);

  await B.goto(URL);
  await step('B signs up with Google and joins', async () => {
    await B.evaluate(() => { window.__googleEmail = 'priya@nirmaan.in'; window.__googleName = 'Priya Nair'; });
    await B.click('text=Continue with Google');
    await B.getByRole('heading', { name: 'Welcome to Verth' }).waitFor({ timeout: 5000 });
    await B.click('text=Skip the tour');
    await B.click('text=I have an invite code');
    await B.fill('#j-code', 'ZZZ-999'); await B.fill('#j-title', 'Accounts'); await B.click('button[type=submit]');
    await B.getByText('doesn’t match any circle').waitFor({ timeout: 3000 });
    await B.fill('#j-code', code.toLowerCase()); await B.click('button[type=submit]');
    await B.getByRole('heading', { name: 'Your code' }).waitFor({ timeout: 5000 });
  });
  await shot(B, '08-B-home');
  await step('A sees Priya in circle', () => A.getByText('Priya Nair').waitFor({ timeout: 5000 }));

  await step('B sends a check to Rajesh', async () => {
    await B.click('nav >> text=Verify');
    await B.selectOption('#v-channel', 'WhatsApp');
    await B.fill('#v-what', 'pay ₹4,80,000 to Sharma Traders today');
    await B.click('button:has-text("Send check")');
    await B.getByRole('heading', { name: /Asking Rajesh/ }).waitFor({ timeout: 5000 });
  });
  await shot(B, '09-B-waiting');
  await step('A gets the incoming check', async () => {
    await A.click('nav >> text=Home');
    await A.locator('.incoming').waitFor({ timeout: 5000 });
  });
  await shot(A, '10-A-incoming');
  await step('A denies; B sees denied and reports', async () => {
    await A.click('text=No, not me');
    await B.getByRole('heading', { name: /didn’t send this/ }).waitFor({ timeout: 5000 });
    await shot(B, '11-B-denied');
    await B.click('text=Report to my circle');
    await B.getByText('Reported to your circle').waitFor({ timeout: 5000 });
  });
  await step('B sends a genuine one; A confirms', async () => {
    await B.click('text=New check');
    await B.fill('#v-what', 'release invoice INV-2291 for ₹1,25,000');
    await B.click('button:has-text("Send check")');
    await A.locator('.incoming').waitFor({ timeout: 5000 });
    await A.click('text=Yes, I asked');
    await B.getByRole('heading', { name: /Confirmed by Rajesh/ }).waitFor({ timeout: 5000 });
  });
  await shot(B, '12-B-confirmed');
  await step('Code check: wrong then right', async () => {
    await B.click('.seg >> text=Check a code');
    await B.fill('#v-code', '123456'); await B.click('button:has-text("Check code")');
    await B.getByRole('heading', { name: 'Code doesn’t match' }).waitFor({ timeout: 5000 });
    await shot(B, '13-B-code-wrong');
    await A.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector('[data-mycode]')?.textContent || ''), null, { timeout: 5000 });
    const real = (await A.locator('[data-mycode]').textContent()).trim();
    await B.fill('#v-code', real); await B.click('button:has-text("Check code")');
    await B.getByRole('heading', { name: 'Code matches' }).waitFor({ timeout: 5000 });
  });
  await shot(B, '14-B-code-ok');
  await step('Log, guide, plan', async () => {
    await A.click('nav >> text=Log'); await A.getByRole('heading', { name: 'Verification log' }).waitFor();
    await shot(A, '15-A-log');
    await A.click('nav >> text=Guide'); await shot(A, '16-A-guide');
    await A.click('nav >> text=Plan'); await A.click('text=Choose Family');
    await A.getByText('We’ll notify you').waitFor({ timeout: 3000 });
    await shot(A, '17-A-plan');
  });
  await step('Expiry: unanswered check expires', async () => {
    await B.click('nav >> text=Verify'); await B.click('.seg >> text=Ask on their phone');
    await B.evaluate(() => { const r = JSON.parse(localStorage.getItem('fakefs')); });
    await B.fill('#v-what', 'share the OTP for the vendor portal');
    await B.click('button:has-text("Send check")');
    await B.getByRole('heading', { name: /Asking Rajesh/ }).waitFor({ timeout: 5000 });
    // fast-forward: set expiresAt in the past
    await B.evaluate(() => { const db = JSON.parse(localStorage.getItem('fakefs')); for (const k in db) if (db[k].status === 'pending') db[k].expiresAt = { __ts: Date.now() - 1000 }; localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x'); });
    await B.getByRole('heading', { name: /No answer from Rajesh/ }).waitFor({ timeout: 6000 });
  });
  await step('Dark mode renders', async () => {
    await A.emulateMedia({ colorScheme: 'dark' }); await A.click('nav >> text=Home'); await shot(A, '18-A-home-dark');
  });
  console.log('errors:', JSON.stringify(errors));
  await b.close();
})().catch(async (e) => { console.log('ABORT'); process.exit(1); });
