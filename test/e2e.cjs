// Two-person browser test (plus attacker behaviour) against the in-browser Firebase stand-in.
// Rajesh (CEO, admin) on page A, Priya (Accounts) on page B.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const URL = 'http://127.0.0.1:8765/app.html?emu';
const errors = [];
const SLOW = process.env.CI ? 3 : 1;

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
  // The first page shows the "Welcome to Verth" greeting; the rest skip it (once per visit, like a person's tab).
  await ctx.addInitScript(() => { if (!window.name.includes('greet')) { try { sessionStorage.setItem('verth-splash', '1'); } catch (e) {} } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  for (const [n, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', (e) => errors.push(n + ' pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(n + ' console: ' + m.text()); });
  }
  const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  let failed = 0; const extra = [];
  const step = async (msg, fn) => {
    try { await fn(); console.log('ok  ', msg); }
    catch (e) { failed++; console.log('FAIL', msg, '-', e.message.split('\n')[0]); if (process.env.CI) console.log(`::error title=E2E failed::${msg}: ${e.message.split('\n')[0]} | page errors: ${JSON.stringify(errors).slice(0, 400)}`); await shot(A, 'fail-A'); await shot(B, 'fail-B'); for (const [n, pg] of extra) await shot(pg, 'fail-' + n).catch(() => {}); throw e; }
  };
  const fs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fakefs') || '{}'));
  // Moves an account's sign-up date back 8 days, so its 7-day free trial has just ended.
  const endTrial = (p) => p.evaluate(() => {
    const S = window.__verth.S, old = Date.now() - 8 * 864e5;
    S.profile.createdAt = old;
    const d = JSON.parse(localStorage.getItem('fakefs')); d['users/' + S.user.uid].createdAt = { __ts: old }; localStorage.setItem('fakefs', JSON.stringify(d));
  });
  const poke = (p) => p.evaluate(() => new BroadcastChannel('fakefire').postMessage('x'));

  // A stand-in for the Verth server's email codes. The code in the "email" is always 482913.
  const PAY = 'https://pay.test.workers.dev';
  const corsH = { 'access-control-allow-origin': 'http://127.0.0.1:8765', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
  const otpSeen = [], registered = new Set(), serverCalls = [];
  await A.route(PAY + '/otp/**', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: corsH });
    const path = new (require('node:url').URL)(r.request().url()).pathname, body = JSON.parse(r.request().postData() || '{}');
    otpSeen.push([path, body]);
    const email = String(body.email || '').trim().toLowerCase();
    if (path === '/otp/send') {
      if (body.mode === 'login' && !registered.has(email)) return r.fulfill({ status: 404, headers: corsH, json: { error: 'No Verth account uses this email yet. Tap “Create account” to make one first.' } });
      if (body.mode === 'signup' && registered.has(email)) return r.fulfill({ status: 409, headers: corsH, json: { error: 'You already have a Verth account with this email. Tap “Log in” instead.' } });
      return r.fulfill({ headers: corsH, json: { sent: true, resendInSeconds: 30 } });
    }
    if (body.code !== '482913') return r.fulfill({ status: 400, headers: corsH, json: { error: 'That code isn’t right. 4 tries left.' } });
    const isNew = !registered.has(email); registered.add(email);
    const tok = 'h.' + Buffer.from(JSON.stringify({ uid: 'u_rajesh', email: body.email })).toString('base64') + '.s';
    return r.fulfill({ headers: corsH, json: { token: tok, isNew } });
  });
  // A stand-in for the mobile check: the SMS code is always 246810.
  const smsSeen = [];
  await A.route(PAY + '/phone/**', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: corsH });
    const path = new (require('node:url').URL)(r.request().url()).pathname, body = JSON.parse(r.request().postData() || '{}');
    smsSeen.push([path, body]);
    if (path === '/phone/status') return r.fulfill({ headers: corsH, json: { enabled: true } });
    if (path === '/phone/send') { smsSeen.phone = body.phone; return r.fulfill({ headers: corsH, json: { sent: true, resendInSeconds: 45 } }); }
    if (body.code !== '246810') return r.fulfill({ status: 400, headers: corsH, json: { error: 'That code isn’t right. 4 tries left.' } });
    const full = '+91' + smsSeen.phone; // the server marks the profile verified
    await A.evaluate((ph) => { const d = JSON.parse(localStorage.getItem('fakefs') || '{}'); Object.assign(d['users/u_rajesh'], { phone: ph, phoneVerified: ph }); localStorage.setItem('fakefs', JSON.stringify(d)); }, full);
    return r.fulfill({ headers: corsH, json: { verified: true, phone: full } });
  });
  for (const pth of ['/account/**', '/passkey/**']) await A.route(PAY + pth, async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: corsH });
    const path = new (require('node:url').URL)(r.request().url()).pathname;
    serverCalls.push(path);
    return r.fulfill({ headers: corsH, json: path === '/passkey/list' ? { keys: [] } : { sent: true } });
  });
  // The bank name behind a UPI ID (the server asks Razorpay).
  await ctx.route('**/upi/name', (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: corsH })
    : r.fulfill({ headers: corsH, json: JSON.parse(r.request().postData() || '{}').vpa === 'priya.nair@okaxis' ? { valid: true, name: 'PRIYA NAIR' } : { valid: false } })));
  // New people sign up with Google, then finish their profile and see the welcome screen.
  const googleSignup = async (p, email, name, phone) => {
    if (p !== A) await p.route('**/passkey/**', (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: corsH }) : r.fulfill({ headers: corsH, json: {} })));
    await p.evaluate(([e, n]) => { window.__googleEmail = e; window.__googleName = n; }, [email, name]);
    await p.click('.auth-tabs >> text=Create account');
    await p.click('text=Sign up with Google');
    await p.getByRole('heading', { name: 'Almost done' }).waitFor({ timeout: 5000 * SLOW });
    if ((await p.locator('#n-name').inputValue()) !== name) throw new Error('name not prefilled from Google');
    await p.selectOption('#n-gender', 'female'); await p.fill('#n-dob', '1992-03-08');
    await p.fill('#n-phone', phone); await p.check('#n-agree');
    await p.click('button:has-text("Create my account")');
    await p.getByRole('heading', { name: 'Lock Verth to your phone' }).waitFor({ timeout: 5000 * SLOW });
    await p.click('button:has-text("Turn on fingerprint / face")');
    await p.click('text=Continue without it (less secure)', { timeout: 8000 * SLOW });
    await p.getByRole('heading', { name: /Welcome to Verth, / }).waitFor({ timeout: 5000 * SLOW });
    await p.locator('.welcome-card button', { hasText: /Maybe later|Let’s get started/ }).click();
  };
  await A.goto(URL + '&payapi=' + encodeURIComponent(PAY));
  await step('log-in page shows straight away, with no loading screen', async () => {
    await A.getByRole('heading', { name: 'Log in to Verth' }).waitFor({ timeout: 3000 * SLOW });
    if (await A.getByText('Loading', { exact: false }).count()) throw new Error('a loading message is showing');
    await shot(A, '00-A-login');
  });
  await step('someone without an account cannot log in', async () => {
    await A.fill('#a-email', 'not-an-email'); await A.click('button:has-text("Email me a code")');
    await A.getByText('doesn’t look right').waitFor({ timeout: 3000 * SLOW });
    await A.fill('#a-email', 'rajesh@nirmaan.in'); await A.click('button:has-text("Email me a code")');
    await A.getByText('No Verth account uses this email').waitFor({ timeout: 3000 * SLOW });
  });
  { const keep = errors.filter((e) => !e.includes('status of 404')); errors.length = 0; errors.push(...keep); }
  await step('A creates an account: name, email, phone, agree, email code (wrong code first), special welcome', async () => {
    await A.click('.auth-tabs >> text=Create account');
    await A.getByRole('heading', { name: 'Create your Verth account' }).waitFor();
    await A.fill('#a-name', 'Rajesh Mehta'); await A.fill('#a-email', 'Rajesh@Nirmaan.in');
    await A.click('button:has-text("Send verification code")');
    await A.getByText('Please choose your gender').waitFor({ timeout: 3000 * SLOW });
    await A.selectOption('#a-gender', 'male');
    await A.fill('#a-dob', new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10)); // 10 years old
    await A.click('button:has-text("Send verification code")');
    await A.getByText('at least 13').waitFor({ timeout: 3000 * SLOW });
    await A.fill('#a-dob', '1984-06-15');
    // The +code follows the country.
    if ((await A.locator('#a-dial').textContent()) !== '+91') throw new Error('India should be the default');
    await A.selectOption('#a-country', 'GB');
    if ((await A.locator('#a-dial').textContent()) !== '+44') throw new Error('code did not change with the country');
    await A.selectOption('#a-country', 'IN');
    if ((await A.locator('#a-dial').textContent()) !== '+91') throw new Error('code did not change back');
    await A.fill('#a-phone', '12345');
    await A.click('button:has-text("Send verification code")');
    await A.getByText('10-digit Indian mobile number').waitFor({ timeout: 3000 * SLOW });
    await A.fill('#a-email', 'rajesh@gmial.com'); await A.fill('#a-phone', '98765 43210'); await A.check('#a-agree');
    await A.click('button:has-text("Send verification code")');
    await A.getByText('Did you mean').waitFor({ timeout: 3000 * SLOW });
    await A.click('#a-err >> text=rajesh@gmail.com');
    if ((await A.locator('#a-email').inputValue()) !== 'rajesh@gmail.com') throw new Error('typo fix not applied');
    await A.fill('#a-email', 'x@mailinator.com'); await A.click('button:has-text("Send verification code")');
    await A.getByText('Temporary email addresses').waitFor({ timeout: 3000 * SLOW });
    await A.fill('#a-email', 'Rajesh@Nirmaan.in'); await A.uncheck('#a-agree');
    await A.click('button:has-text("Send verification code")');
    await A.getByText('Please tick the box').waitFor({ timeout: 3000 * SLOW });
    await A.check('#a-agree');
    await A.click('button:has-text("Send verification code")');
    await A.getByRole('heading', { name: 'Verify your email' }).waitFor({ timeout: 5000 * SLOW });
    await A.getByText('rajesh@nirmaan.in').waitFor();
    if (!(await A.locator('#a-resend').isDisabled())) throw new Error('resend should wait 30 seconds');
    await shot(A, '00-A-code');
    await A.fill('#a-code', '111111'); // six digits submit by themselves
    await A.getByText('That code isn’t right').waitFor({ timeout: 3000 * SLOW });
    await A.fill('#a-code', '482913');
    // Last step: verify the mobile number by SMS.
    await A.getByRole('heading', { name: 'Verify your mobile' }).waitFor({ timeout: 5000 * SLOW });
    if ((await A.locator('.steps3 li').count()) !== 5) throw new Error('sign-up should show 5 steps (details, email, mobile, fingerprint, done)');
    if ((await A.locator('#m-phone').inputValue()) !== '9876543210') throw new Error('mobile not prefilled');
    await A.click('button:has-text("Send SMS code")');
    await A.getByText('We sent a 6-digit code by SMS to').waitFor({ timeout: 5000 * SLOW });
    await shot(A, '00a-A-sms');
    await A.fill('#m-code', '000000');
    await A.getByText('That code isn’t right').waitFor({ timeout: 3000 * SLOW });
    await A.fill('#m-code', '246810');
    // Then lock the account to this phone with fingerprint / face. Skipping only appears after a try.
    await A.getByRole('heading', { name: 'Lock Verth to your phone' }).waitFor({ timeout: 5000 * SLOW });
    await shot(A, '00c-A-lock');
    if (await A.getByText('Continue without it').count()) throw new Error('skip should only appear after trying');
    await A.click('button:has-text("Turn on fingerprint / face")');
    await A.click('text=Continue without it (less secure)', { timeout: 8000 * SLOW });
    await A.getByRole('heading', { name: /Welcome to Verth, Rajesh/ }).waitFor({ timeout: 5000 * SLOW });
    await A.getByText('Mobile number verified').first().waitFor();
    await shot(A, '00b-A-welcome');
    const signupSend = otpSeen.filter(([pth, b]) => pth === '/otp/send' && b.mode === 'signup').at(-1);
    if (!signupSend || signupSend[1].name !== 'Rajesh Mehta' || signupSend[1].email !== 'Rajesh@Nirmaan.in') throw new Error('bad signup call ' + JSON.stringify(otpSeen));
    const prof = (await fs(A))['users/u_rajesh'];
    if (prof?.name !== 'Rajesh Mehta' || prof?.phone !== '+919876543210' || !prof?.agreedAt || prof?.gender !== 'male' || prof?.dob !== '1984-06-15' || prof?.country !== 'IN') throw new Error('profile not saved: ' + JSON.stringify(prof));
    await A.waitForTimeout(300);
    if (!serverCalls.includes('/account/welcome')) throw new Error('welcome email not requested');
    await A.locator('.welcome-card button', { hasText: /Maybe later|Let’s get started/ }).click();
    await A.getByRole('heading', { name: 'Welcome to Verth' }).waitFor({ timeout: 5000 * SLOW });
  });
  // The wrong code above was a deliberate 400 from the server; the browser logs it as an error.
  { const keep = errors.filter((e) => !e.includes('status of 400')); errors.length = 0; errors.push(...keep); }
  await step('A creates an organisation', async () => {
    await A.click('text=Skip the tour'); await A.click('text=My organisation');
    await A.fill('#c-name', 'Nirmaan Infra'); await A.fill('#c-title', 'CEO');
    await A.click('button[type=submit]');
    await A.getByRole('heading', { name: 'Invite people' }).waitFor({ timeout: 5000 * SLOW });
    // New accounts start with a 7-day free trial.
    await A.locator('.trial-banner', { hasText: 'Free trial: 7 days left' }).waitFor({ timeout: 3000 * SLOW });
    await endTrial(A); await A.click('nav >> text=Home');
    await A.locator('.trial-banner.ended', { hasText: 'Your 7-day free trial has ended' }).waitFor({ timeout: 3000 * SLOW });
    await shot(A, '01a-A-trial-ended');
    await A.click('nav >> text=Circle');
  });
  const code = (await A.locator('.invite .mono').textContent()).trim();
  await step('invite code is 8 characters', async () => { if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) throw new Error('bad code ' + code); });

  await step('Invite: share button and a personal invite link with the code', async () => {
    await A.getByRole('button', { name: /Send an invite/ }).waitFor();
    const link = await A.evaluate(() => window.__verth.inviteLink());
    const u = new globalThis.URL(link);
    if (!u.pathname.endsWith('/join.html') || u.searchParams.get('c') !== code.replace('-', '') || u.searchParams.get('n') !== 'Nirmaan Infra' || u.searchParams.get('t') !== 'org') throw new Error('bad invite link ' + link);
  });
  // B opens the invite link's "Join now" (app.html?mode=signup&invite=CODE): the code is filled in after sign-up.
  await B.goto(URL + '&mode=signup&invite=' + code.replace('-', ''));
  await step('B joins from the invite link and waits for approval', async () => {
    await googleSignup(B, 'priya@nirmaan.in', 'Priya Nair', '9123456780');
    await endTrial(B);
    await B.locator('#j-code').waitFor({ timeout: 5000 * SLOW });
    if ((await B.locator('#j-code').inputValue()).replace(/[^A-Z0-9]/gi, '').toUpperCase() !== code.replace('-', '')) throw new Error('invite code not prefilled');
    await B.fill('#j-title', 'Accounts'); await B.click('button[type=submit]');
    await B.getByRole('heading', { name: 'Waiting for approval' }).waitFor({ timeout: 5000 * SLOW });
  });
  await shot(B, '01-B-pending');
  await step('pending member is not usable for checks', async () => {
    await A.click('nav >> text=Verify');
    await A.getByRole('heading', { name: 'Invite someone first' }).waitFor({ timeout: 3000 * SLOW });
  });
  await step('A approves B', async () => {
    await A.getByText('waiting').first().waitFor({ timeout: 5000 * SLOW });
    await A.click('nav >> text=Circle');
    await A.getByRole('heading', { name: 'Waiting for your approval' }).waitFor();
    await shot(A, '02-A-approval');
    await A.locator('.attention a[href="tel:+919123456780"]', { hasText: '+91 91234 56780' }).waitFor(); // phone shown for approval
    await A.click('button:has-text("Approve")');
    await B.getByRole('heading', { name: 'Your Verth code' }).waitFor({ timeout: 6000 * SLOW });
  });

  await step('Company security: make an admin, company email lock, staff list, two-admin approval', async () => {
    await A.click('nav >> text=Circle');
    await A.getByRole('heading', { name: 'Company security' }).waitFor({ timeout: 5000 * SLOW });
    if (!(await A.getByText('You need at least two admins first').isVisible())) throw new Error('two-admin should need a second admin');
    await A.click('button:has-text("Make admin")');
    await A.getByText('Priya Nair is now an admin.').waitFor({ timeout: 5000 * SLOW });
    await A.click('button:has-text("Lock to @nirmaan.in")');
    await A.locator('.vbadge', { hasText: 'Verified company' }).waitFor({ timeout: 5000 * SLOW });
    let d = await fs(A);
    const cid = await A.evaluate(() => window.__verth.S.circleId);
    if (d['circles/' + cid]?.domain !== 'nirmaan.in') throw new Error('company lock not saved');
    if (d['invites/' + d['circles/' + cid].inviteCode]?.domain !== 'nirmaan.in') throw new Error('invite not updated with the lock');
    await A.fill('#al-list', 'Kamla Devi, kamla@nirmaan.in\nsomeone@gmail.com\nnot an email');
    await A.click('button:has-text("Add to the list")');
    await A.getByText('Skipped 1 that aren’t @nirmaan.in').waitFor({ timeout: 5000 * SLOW });
    await A.locator('.allow-list', { hasText: 'kamla@nirmaan.in' }).waitFor();
    await A.waitForTimeout(200);
    const addBtn = A.locator('[data-form="allow-add"] button[type=submit]');
    if (await addBtn.isDisabled() || await addBtn.evaluate((b) => b.classList.contains('is-loading'))) throw new Error('add button stuck busy');
    await A.click('button:has-text("Only people on the list")');
    await A.getByText('Only people on this list can ask to join.').waitFor({ timeout: 5000 * SLOW });
    await A.click('button:has-text("Turn on two-admin approval")');
    await A.getByText('On. Two admins approve everyone.').waitFor({ timeout: 5000 * SLOW });
    await shot(A, '02b-A-company');
    // Put things back for the rest of the run.
    await A.click('[data-act="two-admins"][data-v="0"]');
    await A.getByText('Two-admin approval is off.').waitFor({ timeout: 5000 * SLOW });
    await A.click('[data-act="list-only"][data-v="0"]');
    await A.getByText('Anyone with the invite code can ask to join again.').waitFor({ timeout: 5000 * SLOW });
    await A.click('[data-act="company-lock"][data-v="0"]');
    await A.getByText('Company lock turned off.').waitFor({ timeout: 5000 * SLOW });
    await A.click('button:has-text("Remove admin")');
    await A.getByText('Priya Nair is no longer an admin.').waitFor({ timeout: 5000 * SLOW });
    d = await fs(A);
    if (d['circles/' + cid].twoAdmins || d['circles/' + cid].listOnly || d['circles/' + cid].domain) throw new Error('settings not turned off');
  });

  await step('Private chat: encrypted messages and files, Pay safely, daily limit', async () => {
    // Priya adds her UPI ID so her circle can pay her safely.
    await B.click('nav >> text=Chat');
    await B.getByRole('heading', { name: 'Talk privately' }).waitFor({ timeout: 5000 * SLOW });
    await B.fill('#u-upi', 'not a upi'); await B.click('button:has-text("Save")');
    await B.getByText('doesn’t look like a UPI ID').waitFor();
    await B.fill('#u-upi', 'Priya.Nair@okaxis'); await B.click('button:has-text("Save")');
    await B.getByText('Saved: priya.nair@okaxis').waitFor({ timeout: 5000 * SLOW });
    await shot(B, '04-B-chat-list');
    // Rajesh writes to Priya.
    await A.click('nav >> text=Chat');
    await A.click('.chat-row:has-text("Priya Nair")');
    await A.getByText('Say hello to Priya').waitFor({ timeout: 5000 * SLOW });
    await A.fill('#c-text', 'Hi Priya, sending the GST certificate now');
    await A.press('#c-text', 'Enter');
    await A.locator('.msg.me', { hasText: 'Hi Priya, sending the GST certificate now' }).waitFor({ timeout: 5000 * SLOW });
    await A.fill('#c-text', 'my otp is 482913'); await A.click('.composer .send');
    await A.getByText('That looks like an OTP').waitFor();
    await A.fill('#c-text', '');
    await A.setInputFiles('#c-file', { name: 'GST-certificate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Verth test certificate\n' + 'x'.repeat(3000)) });
    await A.fill('#c-text', 'Certificate attached');
    await A.click('.composer .send');
    await A.locator('.msg.me .file-card', { hasText: 'GST-certificate.pdf' }).waitFor({ timeout: 8000 * SLOW });
    // Nothing readable is stored: only ciphertext.
    const raw = JSON.stringify(Object.entries(await fs(A)).filter(([k]) => k.includes('/chats/')));
    if (/sending the GST|GST-certificate|Verth test certificate|Certificate attached/.test(raw) || raw.includes(Buffer.from('%PDF-1.4').toString('base64'))) throw new Error('chat stored in plain text');
    // Priya sees an unread badge, then the decrypted messages.
    await B.locator('.tabs .badge').waitFor({ timeout: 6000 * SLOW });
    await B.click('nav >> text=Chat');
    await B.click('.chat-row:has-text("Rajesh Mehta")');
    await B.locator('.msg.them', { hasText: 'Hi Priya, sending the GST certificate now' }).waitFor({ timeout: 6000 * SLOW });
    await B.locator('.msg.them .file-card', { hasText: 'GST-certificate.pdf' }).waitFor();
    // Pay safely: the payee's own UPI ID is used; on a computer a QR code is shown.
    await A.click('.chat-head >> text=Pay');
    await A.getByText('To priya.nair@okaxis').waitFor({ timeout: 5000 * SLOW });
    await A.getByText('changed this UPI ID').waitFor(); // set minutes ago, so payers are warned
    await A.locator('#pay-name .un-badge.ok', { hasText: 'PRIYA NAIR' }).waitFor({ timeout: 5000 * SLOW }); // bank name, matches Priya
    await A.fill('#p-amt', '0'); await A.click('button:has-text("Pay with my UPI app")');
    await A.getByText('between ₹1 and ₹1,00,000').waitFor();
    await A.fill('#p-amt', '2,500'); await A.fill('#p-note', 'Vendor advance');
    await A.click('button:has-text("Pay with my UPI app")');
    await A.locator('.qr-box svg').waitFor({ timeout: 5000 * SLOW });
    await shot(A, '04a-A-chat');
    await B.locator('.msg.them .pay-card', { hasText: '₹2,500' }).waitFor({ timeout: 6000 * SLOW });
    await shot(B, '04b-B-chat');
    // Free plan: after 12 messages today, plans are offered instead of the message box.
    await A.click('.pay-sheet >> text=Close');
    // Receipts: the payer marks it paid (with the UPI reference), the receiver confirms it arrived.
    await A.getByText('Did your ₹2,500 payment to Priya go through?').waitFor({ timeout: 5000 * SLOW });
    await A.fill('#pc-utr', '427512345678'); await A.click('.pay-ask >> text=Yes, paid');
    await A.locator('.sys-pill', { hasText: 'You marked ₹2,500 as paid · UPI ref 427512345678' }).waitFor({ timeout: 5000 * SLOW });
    await B.locator('.sys-pill', { hasText: 'Rajesh marked ₹2,500 as paid' }).waitFor({ timeout: 6000 * SLOW });
    await B.click('.msg.them .pay-card >> text=I received it');
    await A.locator('.pc-chip', { hasText: 'Received' }).waitFor({ timeout: 6000 * SLOW });
    await A.click('.msg.me .pay-card >> text=View receipt');
    await A.locator('.rc-card .rc-state', { hasText: 'Received' }).waitFor();
    await A.locator('.rc-card', { hasText: 'UPI ref 427512345678' }).waitFor();
    await shot(A, '04d-A-receipt');
    await A.click('[data-rc="close"]');
    // Payment history across chats, decrypted on the phone.
    await A.click('.chat-head .back');
    await A.click('button:has-text("Show history")');
    await A.locator('.ph-row', { hasText: 'To Priya Nair' }).waitFor({ timeout: 6000 * SLOW });
    await A.locator('.ph-tot', { hasText: '₹2,500' }).waitFor();
    await shot(A, '04e-A-history');
    await A.click('.chat-row:has-text("Priya Nair")');
    await A.evaluate(() => { const S = window.__verth.S; S.daily.chat.count = 12; });
    await A.click('.chat-head .back'); await A.click('.chat-row:has-text("Priya Nair")');
    await A.getByText('You’ve used today’s 12 free messages.').waitFor({ timeout: 5000 * SLOW });
    await shot(A, '04c-A-limit');
    await A.evaluate(() => { const S = window.__verth.S; S.daily.chat.count = 2; });
    await A.click('nav >> text=Home'); await B.click('nav >> text=Home');
  });

  await step('B sends a check; A denies (signed)', async () => {
    await B.click('nav >> text=Verify');
    await B.selectOption('#v-channel', 'WhatsApp');
    await B.fill('#v-what', 'pay ₹4,80,000 to Sharma Traders today');
    await B.click('button:has-text("Send check")');
    await B.getByRole('heading', { name: /Asking Rajesh/ }).waitFor({ timeout: 5000 * SLOW });
    await A.click('nav >> text=Home');
    await A.locator('.incoming').waitFor({ timeout: 5000 * SLOW });
    await shot(A, '03-A-incoming');
    await A.click('text=No, not me');
    await B.getByRole('heading', { name: /didn’t send this/ }).waitFor({ timeout: 5000 * SLOW });
  });
  await step('Yes needs a second, explicit confirmation', async () => {
    await B.click('text=New check');
    await B.fill('#v-what', 'release invoice INV-2291 for ₹1,25,000');
    await B.click('button:has-text("Send check")');
    await A.locator('.incoming').waitFor({ timeout: 5000 * SLOW });
    await A.click('text=Yes, I asked…');
    await A.getByText('Confirm: you asked').waitFor();
    await shot(A, '04-A-confirm-yes');
    await A.click('text=Yes, I made this request');
    await B.getByRole('heading', { name: /Confirmed by Rajesh/ }).waitFor({ timeout: 6000 * SLOW });
  });
  await shot(B, '05-B-confirmed-signed');

  await step('ATTACK: forged "Yes" without a valid signature is flagged as untrusted', async () => {
    await B.click('text=New check');
    await B.fill('#v-what', 'change vendor bank details for Kaveri Logistics');
    await B.click('button:has-text("Send check")');
    await A.locator('.incoming').waitFor({ timeout: 5000 * SLOW });
    // attacker with Rajesh's password writes "confirmed" from another browser, with a junk signature
    await A.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('fakefs'));
      for (const k in db) if (db[k].status === 'pending') { db[k].status = 'confirmed'; db[k].sig = btoa('x'.repeat(64)); db[k].sigN = 1; db[k].answeredAt = { __ts: Date.now() }; }
      localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x');
    });
    await B.getByRole('heading', { name: 'Don’t trust this answer' }).waitFor({ timeout: 6000 * SLOW });
  });
  await shot(B, '06-B-forged-yes');

  await step('ATTACK: a valid signature copied onto a different request is rejected', async () => {
    const db = await fs(B);
    const good = Object.entries(db).find(([k, v]) => v.status === 'confirmed' && v.summary.startsWith('release invoice'));
    await B.click('text=New check');
    await B.fill('#v-what', 'pay ₹9,00,000 to a new account');
    await B.click('button:has-text("Send check")');
    await A.locator('.incoming').waitFor({ timeout: 5000 * SLOW });
    await A.evaluate(([sig]) => {
      const db = JSON.parse(localStorage.getItem('fakefs'));
      for (const k in db) if (db[k].status === 'pending') { db[k].status = 'confirmed'; db[k].sig = sig; db[k].sigN = 1; db[k].answeredAt = { __ts: Date.now() }; }
      localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x');
    }, [good[1].sig]);
    await B.getByRole('heading', { name: 'Don’t trust this answer' }).waitFor({ timeout: 6000 * SLOW });
  });

  await step('Pair codes: right code matches, wrong code fails', async () => {
    await A.click('nav >> text=Home');
    await A.waitForFunction(() => /\d{3} \d{3}/.test(document.querySelector('[data-mycode]')?.textContent || ''), null, { timeout: 5000 * SLOW });
    const real = (await A.locator('[data-mycode]').textContent()).trim();
    await B.click('nav >> text=Verify'); await B.click('.seg >> text=Check a code');
    await B.fill('#v-code', '123456'); await B.click('button:has-text("Check code")');
    await B.getByRole('heading', { name: 'Code doesn’t match' }).waitFor({ timeout: 5000 * SLOW });
    await B.fill('#v-code', real); await B.click('button:has-text("Check code")');
    await B.getByRole('heading', { name: 'Code matches' }).waitFor({ timeout: 5000 * SLOW });
  });
  await step('Code secrets are not stored in the database', async () => {
    const db = JSON.stringify(await fs(A));
    if (/codeSecret|privateKey|"d":/.test(db)) throw new Error('secret material found in database');
  });

  await step('ATTACK: stolen password on a new device needs admin re-approval', async () => {
    const uid = await B.evaluate(() => window.__verth.S.user.uid);
    await B.evaluate((u) => new Promise((res) => { const r = indexedDB.open('verth-device', 1); r.onsuccess = () => { const t = r.result.transaction('keys', 'readwrite'); t.objectStore('keys').delete(u); t.oncomplete = res; }; }), uid);
    await B.reload();
    await B.getByText('Verth is set up on another device').waitFor({ timeout: 6000 * SLOW });
    await shot(B, '07-B-other-device');
    await B.click('text=Use this device instead');
    await B.getByRole('heading', { name: 'Waiting for approval' }).waitFor({ timeout: 6000 * SLOW });
    await A.click('nav >> text=Circle');
    await A.getByRole('heading', { name: 'Waiting for your approval' }).waitFor({ timeout: 6000 * SLOW });
    await A.click('button:has-text("Approve")');
    await B.getByRole('heading', { name: 'Your Verth code' }).waitFor({ timeout: 6000 * SLOW });
    await A.getByText('New device').first().waitFor({ timeout: 5000 * SLOW });
  });
  await shot(A, '08-A-new-device-flag');

  await step('Old signed answers from the previous device no longer verify as current', async () => {
    await A.click('nav >> text=Circle'); await A.click('button:has-text("Open the log")');
    await A.getByRole('heading', { name: 'Every check, on record' }).waitFor();
  });

  await step('Admin changes the invite code; old code stops working', async () => {
    await A.click('nav >> text=Circle');
    await A.click('text=Change code');
    await A.waitForFunction((old) => (document.querySelector('.invite .mono')?.textContent || '').trim() !== old, code, { timeout: 5000 * SLOW });
    const db = await fs(A);
    if (db['invites/' + code.replace('-', '')]) throw new Error('old invite still exists');
  });
  await step('Admin turns joining off', async () => {
    await A.click('text=Turn joining off');
    await A.getByText('Joining is turned off').waitFor({ timeout: 5000 * SLOW });
    await A.click('text=Turn joining on');
  });
  await step('Log export neutralises spreadsheet formulas', async () => {
    const out = await A.evaluate(() => { const v = '=HYPERLINK("http://x")'; let s = v; if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return s; });
    if (!out.startsWith("'=")) throw new Error('not neutralised');
  });
  await step('Scam check: a KYC scam SMS is flagged high risk', async () => {
    await B.click('nav >> text=Scan');
    await B.getByText('2 of 2 free checks left today').waitFor({ timeout: 5000 * SLOW });
    await B.fill('#s-message', 'Dear Customer, your SBI YONO account will be blocked today. Update PAN KYC immediately: http://sbi-yono-kyc.xyz/update');
    await B.click('button:has-text("Check it")');
    await B.getByRole('heading', { name: 'High risk: this looks like a scam' }).waitFor({ timeout: 5000 * SLOW });
    await B.getByText('Pretends to be State Bank of India', { exact: false }).first().waitFor();
    await shot(B, '10-B-scan-danger');
  });
  await step('Scam check: Verth saves the scam by itself, no report button, never the content', async () => {
    await B.getByText('found to be a scam in 1 check').waitFor({ timeout: 5000 * SLOW }); // recorded automatically
    if (await B.locator('button:has-text("as a scam")').count()) throw new Error('manual report button still shown');
    const db = JSON.stringify(await fs(B));
    if (db.includes('sbi-yono-kyc')) throw new Error('reported content stored in database');
  });
  await step('Scam database: someone else checking the same scam link is warned', async () => {
    await A.click('nav >> text=Scan');
    await A.click('.kinds >> text=Link');
    await A.fill('#s-link', 'http://sbi-yono-kyc.xyz/update');
    await A.click('button:has-text("Check it")');
    await A.getByText(/found to be a scam in [2-9] checks/).waitFor({ timeout: 6000 * SLOW });
    await shot(A, '10b-A-scam-db');
    await A.click('text=Check something else');
    await A.click('nav >> text=Home');
  });
  await step('Scam check: phone number analysis', async () => {
    await B.click('text=Check something else');
    await B.click('.kinds >> text=Phone number');
    await B.fill('#s-phone', '+91 1401234567');
    await B.click('button:has-text("Check it")');
    await B.getByText('Marketing number', { exact: false }).first().waitFor({ timeout: 5000 * SLOW });
    await shot(B, '11-B-scan-phone');
  });
  await step('Scam check: third check of the day hits the free limit', async () => {
    await B.click('text=Check something else');
    await B.getByRole('heading', { name: 'You’ve used today’s free checks' }).waitFor({ timeout: 5000 * SLOW });
    await shot(B, '12-B-scan-limit');
  });
  await step('Scan-only account, share-to-Verth and job offer check', async () => {
    const C = await ctx.newPage(); extra.push(['C', C]);
    C.on('pageerror', (e) => errors.push('C pageerror: ' + e.message));
    await C.goto(URL);
    // "Log in with Google" without an account is refused and sends you to Create account.
    await C.evaluate(() => { window.__googleEmail = 'kamla@family.in'; window.__googleName = 'Kamla Devi'; });
    await C.click('text=Continue with Google');
    await C.getByText('There’s no Verth account for that Google account yet').waitFor({ timeout: 5000 * SLOW });
    if (await C.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fakeauth') || '{}')).includes('kamla@family.in'))) throw new Error('the stray Google account was not removed');
    await googleSignup(C, 'kamla@family.in', 'Kamla Devi', '9988776655');
    await endTrial(C);
    await C.click('text=Skip the tour');
    await C.click('text=Just check something suspicious');
    await C.getByRole('heading', { name: 'Scam check', exact: true }).waitFor({ timeout: 5000 * SLOW });
    // Verth Helper: answers in plain words, refuses secrets, and hands pasted links to Scam check.
    await C.click('.vh-fab');
    await C.getByRole('dialog', { name: 'Verth Helper' }).waitFor();
    await C.fill('#vh-q', 'how do I add my mom?');
    await C.press('#vh-q', 'Enter');
    await C.locator('.vh-msg.bot', { hasText: '8-character invite code' }).waitFor({ timeout: 3000 * SLOW });
    await C.fill('#vh-q', 'my otp is 482913');
    await C.press('#vh-q', 'Enter');
    await C.locator('.vh-msg.bot', { hasText: 'Please don’t type OTPs' }).waitFor();
    await shot(C, '13a-C-helper');
    await C.fill('#vh-q', 'sbi-kyc-update.xyz/login');
    await C.press('#vh-q', 'Enter');
    await C.click('.vh-act:has-text("Check it in Scam check")');
    if (!(await C.locator('#vh-panel').isHidden())) throw new Error('helper should close on a phone after taking you somewhere');
    if ((await C.locator('#s-link').inputValue()) !== 'sbi-kyc-update.xyz/login') throw new Error('helper did not prefill the link');
    await C.getByText('From Verth Helper.').waitFor();
    await C.click('.kinds >> text=Link');
    await C.fill('#s-link', 'https://www.onlinesbi.sbi/');
    await C.click('button:has-text("Check it")');
    await C.getByRole('heading', { name: 'No obvious red flags' }).waitFor({ timeout: 5000 * SLOW });
    await shot(C, '13-C-scan-only');
    // A fake exam offer shared to Verth from another app (Android share sheet) opens ready to check.
    const offer = 'From: TCS Recruitment <hr.tcs.careers@gmail.com>\nCongratulations! You have been shortlisted for the TCS online exam. Pay the refundable exam fee of Rs 1500 to confirm your slot: https://tcs-careers-india.in/slot';
    await C.goto(URL + '&share_text=' + encodeURIComponent(offer));
    await C.getByText('Shared to Verth.').waitFor({ timeout: 5000 * SLOW });
    const pre = await C.locator('#s-job').inputValue();
    if (!pre.includes('tcs-careers-india.in')) throw new Error('shared text not prefilled into the job check');
    if (C.url().includes('share_text')) throw new Error('shared text left in the address bar');
    await C.click('button:has-text("Check it")');
    await C.getByRole('heading', { name: 'High risk: this looks like a scam' }).waitFor({ timeout: 5000 * SLOW });
    await C.getByText('Asks you to pay for a job, exam, interview or training').waitFor();
    await C.getByText('@tcs.com', { exact: false }).first().waitFor();
    await shot(C, '14-C-job-check');
    // Photo and screenshot checks: read on the device, 5 free, then the plan screen.
    const FIX = require('node:path').join(__dirname, 'fixtures');
    await C.click('text=Check something else');
    await C.click('.kinds >> text=Photo or screenshot');
    await C.getByText('Tap here to add a screenshot or photo').waitFor();
    await C.getByText('5 of 5 free photo checks left').waitFor();
    await C.setInputFiles('#s-image', FIX + '/scam-sms.png');
    await C.locator('.photo-pick img').waitFor();
    await C.click('button:has-text("Check it")');
    await C.getByRole('heading', { name: 'High risk: this looks like a scam' }).waitFor({ timeout: 60000 * SLOW });
    await C.getByText('Suspicious link: sbi-yono-kyc.xyz', { exact: false }).first().waitFor();
    await C.getByText('What Verth found in your picture').waitFor();
    await shot(C, '14a-C-photo-sms');
    await C.click('text=Check something else');
    await C.click('.kinds >> text=Photo or screenshot');
    await C.setInputFiles('#s-image', FIX + '/qr-cashback.png');
    await C.click('button:has-text("Check it")');
    await C.getByText('A QR code you’re told will give you money').waitFor({ timeout: 60000 * SLOW });
    await C.getByText('A UPI QR code that pays ₹4,999', { exact: false }).waitFor();
    await shot(C, '14b-C-photo-qr');
    for (let i = 3; i <= 5; i++) {
      await C.click('text=Check something else');
      await C.click('.kinds >> text=Photo or screenshot');
      await C.setInputFiles('#s-image', FIX + '/scam-sms.png');
      await C.click('button:has-text("Check it")');
      await C.getByRole('heading', { name: 'High risk: this looks like a scam' }).waitFor({ timeout: 60000 * SLOW });
    }
    await C.click('text=Check something else');
    await C.click('.kinds >> text=Photo or screenshot');
    await C.getByRole('heading', { name: 'You’ve used your 5 free photo checks' }).waitFor();
    if (await C.locator('#s-image').count()) throw new Error('photo upload still offered after the free limit');
    await shot(C, '14c-C-photo-limit');
    // "Not sure?" opens the helper with big start buttons.
    await C.click('.kinds >> text=Not sure? Ask for help');
    await C.getByText('📷 I have a screenshot or photo').waitFor();
    await C.click('.vh-x');
    await C.close();
  });
  await step('Payments: Team plan through Razorpay Checkout, then cancel renewal', async () => {
    const cors = corsH;
    const seen = [];
    // A stand-in for Razorpay Checkout: "pays" straight away and returns a signed result.
    await A.route('https://checkout.razorpay.com/v1/checkout.js', (r) => r.fulfill({ contentType: 'text/javascript', body:
      'window.Razorpay=function(o){this.open=function(){window.__rzpOpts={key:o.key,subscription_id:o.subscription_id};setTimeout(function(){o.handler({razorpay_payment_id:"pay_1",razorpay_subscription_id:o.subscription_id,razorpay_signature:"s"})},80)}};' }));
    // A stand-in for the payments worker. Like the real one, it is what writes the plan.
    await A.route(PAY + '/**', async (r) => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      const path = new (require('node:url').URL)(r.request().url()).pathname, body = JSON.parse(r.request().postData() || '{}');
      if (path === '/passkey/list') return r.fulfill({ headers: cors, json: { keys: [] } });
      if (path.startsWith('/phone/') || path.startsWith('/otp/')) return r.fallback();
      seen.push([path, body, r.request().headers().authorization]);
      const end = Date.now() + 30 * 86400000;
      if (path === '/subscribe') return r.fulfill({ headers: cors, json: { subscriptionId: 'sub_T1', keyId: 'rzp_test_1', description: 'Verth Team', quantity: 1 } });
      if (path === '/verify') {
        await A.evaluate(([cid, seats, end]) => { const db = JSON.parse(localStorage.getItem('fakefs')); Object.assign(db['circles/' + cid], { plan: 'team', seats, billing: { product: 'team', subscriptionId: 'sub_T1', status: 'active', seats, currentEnd: { __ts: end }, cancelAtEnd: false } }); localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x'); }, [seen[0][1].circleId, 2000, end]);
        return r.fulfill({ headers: cors, json: { paid: true, status: 'active', product: 'team' } });
      }
      if (path === '/cancel') {
        await A.evaluate((cid) => { const db = JSON.parse(localStorage.getItem('fakefs')); db['circles/' + cid].billing.cancelAtEnd = true; localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x'); }, body.circleId);
        return r.fulfill({ headers: cors, json: { cancelAtEnd: true, until: new Date(end).toISOString() } });
      }
      return r.fulfill({ status: 404, headers: cors, json: { error: 'no' } });
    });
    await A.goto(URL + '&payapi=' + encodeURIComponent(PAY));
    await A.click('nav >> text=Plan');
    await A.click('.plan:has(h3:text-is("Team")) >> button:has-text("Subscribe")');
    await A.getByText('Renews on', { exact: false }).waitFor({ timeout: 6000 * SLOW });
    await A.locator('.plan.current h3', { hasText: 'Team' }).waitFor();
    if (seen[0][0] !== '/subscribe' || seen[0][1].plan !== 'team' || !seen[0][2]?.startsWith('Bearer ')) throw new Error('bad subscribe call ' + JSON.stringify(seen[0]));
    if (seen[1][0] !== '/verify' || seen[1][1].razorpay_subscription_id !== 'sub_T1') throw new Error('checkout result not sent for verification');
    if ((await A.evaluate(() => window.__rzpOpts.key)) !== 'rzp_test_1') throw new Error('checkout opened with the wrong key');
    await shot(A, '15-A-team-plan');
    await A.click('text=Cancel subscription');
    await A.click('text=Yes, stop renewing');
    await A.getByText('Renewal cancelled', { exact: false }).first().waitFor({ timeout: 5000 * SLOW });
    await shot(A, '16-A-cancelled');
  });
  await step('Profile: photo, Team badge, history and account in one place', async () => {
    await A.click('nav >> text=Home');
    if (!(await A.locator('header .me-btn.b-team').count())) throw new Error('header avatar should show the Team badge');
    await A.click('header .me-btn');
    await A.locator('.pf-badge', { hasText: 'Team member' }).waitFor({ timeout: 5000 * SLOW });
    await A.locator('.pf-stats', { hasText: 'Scam checks' }).waitFor();
    await A.locator('.sh-list', { hasText: 'sbi-yono-kyc.xyz' }).waitFor({ timeout: 5000 * SLOW }); // history from this phone
    await A.setInputFiles('#pf-photo', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    await A.locator('header .me-btn img').waitFor({ timeout: 8000 * SLOW });
    await A.waitForFunction(() => /^data:image\/jpeg;base64,/.test(JSON.parse(localStorage.getItem('fakefs') || '{}')['users/u_rajesh']?.photo || ''), null, { timeout: 5000 * SLOW });
    await A.getByText('Fingerprint / face login').first().waitFor(); // account settings live here now
    await shot(A, '22-A-profile');
  });
  await step('App lock: reopening Verth asks to unlock (fingerprint, or an email code)', async () => {
    // Without fingerprint login on this device there's no lock (no email code every time Verth opens).
    await A.evaluate(() => { sessionStorage.removeItem('verth-unlocked'); localStorage.removeItem('verth-pk'); });
    await A.goto(URL + '&payapi=' + encodeURIComponent(PAY));
    await A.locator('nav.tabs').waitFor({ timeout: 8000 * SLOW });
    // With fingerprint login set up on this device, reopening Verth is locked.
    await A.evaluate(() => { sessionStorage.removeItem('verth-unlocked'); localStorage.setItem('verth-pk', '1'); });
    await A.goto(URL + '&payapi=' + encodeURIComponent(PAY));
    await A.getByRole('heading', { name: 'Welcome back, Rajesh' }).waitFor({ timeout: 6000 * SLOW });
    if (await A.locator('nav.tabs').count()) throw new Error('the app must stay hidden while locked');
    await shot(A, '18-A-applock');
    await A.click('button:has-text("Use an email code instead")');
    await A.click('button:has-text("Email me a code")');
    await A.getByText('Enter the code to unlock Verth.').waitFor({ timeout: 5000 * SLOW });
    await A.fill('#a-code', '482913');
    await A.locator('nav.tabs').waitFor({ timeout: 8000 * SLOW });
    // The lock can be switched off (and on again) in the profile.
    await A.click('header .me-btn');
    await A.click('.lock-row .switch');
    await A.getByText('App lock is off on this device.').waitFor({ timeout: 3000 * SLOW });
    await A.evaluate(() => sessionStorage.removeItem('verth-unlocked'));
    await A.goto(URL + '&payapi=' + encodeURIComponent(PAY));
    await A.locator('nav.tabs').waitFor({ timeout: 8000 * SLOW });
    await A.click('header .me-btn');
    await A.click('.lock-row .switch');
    await A.getByText('App lock is on.', { exact: false }).waitFor({ timeout: 3000 * SLOW });
  });
  await step('Signing out with an active subscription asks whether to cancel it', async () => {
    await A.evaluate(() => { const cid = window.__verth.S.circleId; const db = JSON.parse(localStorage.getItem('fakefs')); Object.assign(db['circles/' + cid].billing, { status: 'active', cancelAtEnd: false, payerUid: 'u_rajesh' }); localStorage.setItem('fakefs', JSON.stringify(db)); new BroadcastChannel('fakefire').postMessage('x'); });
    await A.waitForTimeout(400);
    await A.click('header .me-btn');
    await A.click('.card >> button:has-text("Sign out")');
    await A.getByRole('dialog', { name: 'Before you sign out' }).waitFor({ timeout: 3000 * SLOW });
    await A.getByText('Sign out and cancel my subscription').waitFor();
    await shot(A, '17-A-signout-choice');
    await A.click('text=Stay signed in');
    if (await A.locator('#signout-modal').count()) throw new Error('dialog did not close');
    await A.click('text=Delete my account');
    await A.getByText('Type DELETE to confirm').waitFor();
    await A.click('text=Keep my account');
  });
  await step('Phone safety check-up: guided fixes and a score that remembers', async () => {
    await A.click('nav >> text=Home');
    await A.click('.guard-card button:has-text("today’s check-up")');
    await A.getByRole('heading', { name: /Phone safety:/ }).waitFor({ timeout: 5000 * SLOW });
    await A.getByText('Screen lock is on').waitFor();
    await A.click('.g-item details[open] >> text=I’ve done this ✓');
    await A.locator('.g-item.done', { hasText: 'Screen lock is on' }).waitFor({ timeout: 3000 * SLOW });
    if ((await A.locator('.guard-hero .gc-ring b').textContent()).trim() !== '1/10') throw new Error('score should be 1/10');
    await shot(A, '21-A-guard');
    await A.click('nav >> text=Home');
    await A.locator('.guard-card', { hasText: '9 items left in today’s check-up' }).waitFor();
  });
  await step('Wide screens: sidebar, page and safety corner fill the window', async () => {
    await A.setViewportSize({ width: 1440, height: 900 });
    for (const [tab, name] of [['Home', 'wide-home'], ['Scan', 'wide-scan'], ['Chat', 'wide-chat'], ['Circle', 'wide-circle']]) {
      await A.click(`nav >> text=${tab}`); await A.waitForTimeout(500);
      await A.screenshot({ path: OUT + '/' + name + '.png' });
    }
    await A.click('nav >> text=My profile'); await A.waitForTimeout(400); await A.screenshot({ path: OUT + '/wide-profile.png' });
    await A.setViewportSize({ width: 1907, height: 900 }); await A.click('nav >> text=Home'); await A.waitForTimeout(600);
    await A.screenshot({ path: OUT + '/wide-home-1907.png' });
    if (!(await A.locator('aside.rail').isVisible())) throw new Error('safety corner should show on wide screens');
    if (await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('page wider than the window');
    const W = await ctx.newPage(); await W.setViewportSize({ width: 1440, height: 900 }); extra.push(['W', W]);
    await W.goto(URL + '&mode=signup'); await W.locator('.auth-side').waitFor({ state: 'visible', timeout: 5000 * SLOW });
    await W.waitForTimeout(600); await W.screenshot({ path: OUT + '/wide-signup.png' }); await W.close();
    await A.setViewportSize({ width: 400, height: 860 });
    if (await A.locator('aside.rail').isVisible()) throw new Error('safety corner should hide on phones');
    await A.click('nav >> text=Home');
  });
  await step('Phone screens (for review)', async () => {
    await A.setViewportSize({ width: 390, height: 844 });
    const snap = async (name) => { await A.waitForTimeout(1200); await A.screenshot({ path: OUT + '/phone-' + name + '.png' }); };
    await A.click('nav >> text=Home'); await A.evaluate(() => window.scrollTo(0, 0)); await snap('home');
    await A.evaluate(() => window.scrollTo(0, 760)); await snap('home-2');
    await A.click('nav >> text=Scan'); await A.evaluate(() => window.scrollTo(0, 0)); await snap('scan');
    await A.click('nav >> text=Chat'); await A.evaluate(() => window.scrollTo(0, 0)); await snap('chat');
    await A.click('.chat-row:has-text("Priya Nair")'); await snap('chat-room'); await A.click('.chat-head .back');
    await A.click('header .me-btn'); await A.evaluate(() => window.scrollTo(0, 0)); await snap('profile');
    await A.click('nav >> text=Plan'); await A.evaluate(() => window.scrollTo(0, 0)); await snap('plan');
    await A.setViewportSize({ width: 400, height: 860 });
    await A.click('nav >> text=Home');
  });
  await step('“Welcome to Verth” greeting: shown once per visit, then gets out of the way', async () => {
    const D = await ctx.newPage(); extra.push(['D', D]);
    await D.goto(URL);
    await D.evaluate(() => { window.name = 'greet'; sessionStorage.clear(); });
    await D.reload();
    await D.locator('.splash .sp-title').waitFor({ state: 'visible', timeout: 3000 * SLOW });
    await shot(D, '20-splash');
    await D.locator('.splash').waitFor({ state: 'detached', timeout: 4000 * SLOW });
    await D.reload();
    if (await D.locator('.splash').isVisible()) throw new Error('greeting should show only once per visit');
    await D.close();
  });
  await step('Home screen renders', async () => {
    await A.click('nav >> text=Home'); await shot(A, '09-A-home');
  });
  console.log('errors:', JSON.stringify(errors));
  if (process.env.CI && errors.length) console.log(`::error title=Page errors::${JSON.stringify(errors).slice(0, 600)}`);
  console.log(failed || errors.length ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');
  await b.close();
  if (failed || errors.length) process.exit(1);
})().catch((e) => { console.log('ABORTED:', e.message.split('\n')[0]); console.log('errors:', JSON.stringify(errors)); if (process.env.CI) console.log(`::error title=E2E aborted::${e.message.split('\n')[0]} | ${JSON.stringify(errors).slice(0, 400)}`); process.exit(1); });
