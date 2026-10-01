// Unit tests for the scam checker, using real-world style examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLink, checkPhone, checkMessage, checkJob, findCompany, detectKind, registeredDomain, fingerprint } from '../src/scamcheck.js';

const titles = (r) => r.flags.map((f) => f.title).join(' | ');

test('official bank sites are recognised', () => {
  for (const u of ['https://www.onlinesbi.sbi/', 'hdfcbank.com/personal', 'https://www.icicibank.com/login', 'https://www.incometax.gov.in/iec/foportal/']) {
    const r = checkLink(u);
    assert.equal(r.verdict, 'clear', u + ' → ' + titles(r));
    assert.ok(r.good.length, u);
  }
});
test('brand look-alike domains are flagged as danger', () => {
  for (const u of ['http://sbi-kyc-update.xyz/login', 'https://hdfc-netbanking.support/verify', 'amaz0n-refund.in', 'https://paytm.kyc-verify.top', 'onlinesbi.sbi.secure-login.com', 'https://incometax-refund.online/claim']) {
    const r = checkLink(u);
    assert.equal(r.verdict, 'danger', u + ' → ' + titles(r));
  }
});
test('fake government domains are flagged', () => {
  const r = checkLink('https://echallan-parivahan-gov.site/pay');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /government|Parivahan/);
});
test('link tricks: IP, @, punycode, apk, shortener', () => {
  assert.equal(checkLink('http://192.168.10.5/bank').verdict, 'danger');
  assert.equal(checkLink('https://www.google.com@evil.example.com/').verdict, 'danger');
  assert.equal(checkLink('https://xn--pypal-4ve.com').verdict, 'danger');
  assert.equal(checkLink('https://files.example.com/BankUpdate.apk').verdict, 'danger');
  assert.notEqual(checkLink('https://bit.ly/3xYz12').verdict, 'clear');
});
test('ordinary sites are not treated as scams', () => {
  for (const u of ['https://www.wikipedia.org/wiki/India', 'https://github.com/Umeshdk22/verth', 'news.ycombinator.com']) {
    assert.equal(checkLink(u).verdict, 'clear', u + ' → ' + titles(checkLink(u)));
  }
});
test('registered domain handles Indian second-level domains', () => {
  assert.equal(registeredDomain('a.b.sbi.co.in'), 'sbi.co.in');
  assert.equal(registeredDomain('www.incometax.gov.in'), 'incometax.gov.in');
  assert.equal(registeredDomain('x.y.example.com'), 'example.com');
});

test('phone: 1600 numbers are the bank series', () => {
  const r = checkPhone('1600 123 456');
  assert.equal(r.type, 'bfsi');
  assert.notEqual(r.verdict, 'danger');
});
test('phone: 140 marketing numbers cannot be bank verification', () => {
  const r = checkPhone('+91 1401234567');
  assert.equal(r.type, 'promo');
  assert.match(titles(r), /Marketing/);
});
test('phone: international numbers are flagged', () => {
  const r = checkPhone('+92 300 1234567');
  assert.equal(r.type, 'international');
  assert.notEqual(r.verdict, 'clear');
});
test('phone: Indian mobile numbers parse in many formats', () => {
  for (const n of ['9876543210', '+91 98765 43210', '09876543210', '919876543210', '0091-98765-43210']) {
    const r = checkPhone(n);
    assert.equal(r.type, 'mobile', n);
    assert.equal(r.normalized, '+919876543210', n);
  }
});
test('phone: garbage is invalid', () => { assert.equal(checkPhone('12345').type, 'invalid'); });

test('message: digital arrest scam is danger', () => {
  const r = checkMessage('This is CBI officer. Your Aadhaar is linked to money laundering. You are under digital arrest. Stay on the video call and do not tell anyone.');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /Digital arrest|police/i);
  assert.match(titles(r), /secret/);
});
test('message: KYC + link + urgency is danger', () => {
  const r = checkMessage('Dear Customer, your SBI YONO account will be blocked today. Update PAN KYC immediately: http://sbi-yono-kyc.xyz/update');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /Suspicious link/);
  assert.match(titles(r), /KYC/);
});
test('message: someone asking for the OTP is danger', () => {
  const r = checkMessage('Sir I am calling from HDFC bank, please share the OTP you just received to stop the transaction');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /OTP/);
});
test('message: a genuine OTP SMS is not a scam', () => {
  const r = checkMessage('482913 is your OTP for login to SBI YONO. Valid for 3 minutes. Do not share it with anyone. -SBI');
  assert.notEqual(r.verdict, 'danger', titles(r));
  assert.ok(r.good.some((g) => /normal OTP/.test(g)));
});
test('message: QR code to receive money is danger', () => {
  const r = checkMessage('Congrats! Scan this QR code to receive Rs 5000 cashback in your account');
  assert.equal(r.verdict, 'danger');
});
test('message: new number asking for money is danger', () => {
  const r = checkMessage('Hi Papa, this is my new number. Phone got broken. Please send 20000 urgently to this UPI id, will explain later');
  assert.equal(r.verdict, 'danger');
});
test('message: task job scam is at least caution', () => {
  const r = checkMessage('Part time job! Earn ₹3000 daily by doing simple rating task on Telegram. Registration fee only 500.');
  assert.notEqual(r.verdict, 'clear');
  assert.match(titles(r), /job/);
});
test('message: spoofed email sender is danger', () => {
  const r = checkMessage('From: HDFC Bank <alerts@hdfc-secure-mail.com>\nSubject: Account suspended\nDear customer, verify your details');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /isn’t/);
});
test('message: a normal note is clear', () => {
  const r = checkMessage('Hi, are we still meeting for lunch tomorrow at 1? Let me know.');
  assert.equal(r.verdict, 'clear', titles(r));
});

test('detectKind guesses the input type', () => {
  assert.equal(detectKind('+91 98765 43210'), 'phone');
  assert.equal(detectKind('sbi-kyc.xyz/login'), 'link');
  assert.equal(detectKind('Your account is blocked, click here'), 'message');
});
test('fingerprints are stable, private hashes', async () => {
  const a = await fingerprint('phone', '+919876543210'), b = await fingerprint('phone', '+919876543210');
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.ok(!a.includes('9876'));
});

/* ---------- job and exam offers ---------- */
const FAKE_EXAM = 'From: TCS Recruitment <hr.tcs.careers@gmail.com>\nSubject: Selection for TCS Online Assessment\nDear Candidate, Congratulations! You have been shortlisted for the TCS online exam. To confirm your exam slot, pay the refundable exam fee of Rs 1500 via UPI within 24 hours. Visit https://tcs-careers-india.in/slot';
test('job: fake exam fee email (the founder’s story) is high risk with clear reasons', () => {
  const r = checkJob(FAKE_EXAM);
  assert.equal(r.verdict, 'danger');
  assert.equal(r.company.name, 'TCS (Tata Consultancy Services)');
  const t = titles(r);
  assert.match(t, /pay for a job, exam/);
  assert.match(t, /free email address/);
  assert.match(t, /Look-alike TCS/);
  assert.ok(!r.good.some((g) => /official/i.test(g)));
});
test('job: genuine email from the official domain stays clear', () => {
  const r = checkJob('From: TCS Talent Acquisition <talent@tcs.com>\nDear Umesh, following your interview on 12 Sept, please find your offer letter on https://www.tcs.com/careers');
  assert.equal(r.verdict, 'clear', titles(r));
  assert.ok(r.good.some((g) => /official/i.test(g)));
});
test('job: company domain mismatch is caught even without a fee', () => {
  const r = checkJob('From: Infosys HR <recruitment@infosys-careers.co.in>\nPlease attend your interview round tomorrow.', 'Infosys');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /isn’t from Infosys/);
});
test('job: task, WhatsApp interview and document requests are flagged', () => {
  const r = checkJob('Hi, I am HR from a reputed MNC. Interview will be on WhatsApp. Send your Aadhaar and bank details to confirm. No experience needed, 12 LPA.');
  assert.notEqual(r.verdict, 'clear');
  const t = titles(r);
  assert.match(t, /WhatsApp or Telegram/);
  assert.match(t, /ID or bank documents/);
});
test('job: government exam fees get the official-portal advice instead of an outright scam label', () => {
  const r = checkJob('SSC CGL 2026: complete your application and pay the exam fee before 30 October.');
  assert.match(titles(r), /exam fee/);
  assert.ok(!titles(r).includes('pay for a job'));
});
test('job: company is recognised from a typed name or from the text', () => {
  assert.equal(findCompany('', 'infosys').name, 'Infosys');
  assert.equal(findCompany('Offer from Wipro Limited', '').name, 'Wipro');
  assert.equal(findCompany('Hello there', ''), null);
});

/* ---------- photos and screenshots ---------- */
import { checkImage, checkQR, cleanOcr } from '../src/scamcheck.js';
test('photo: text read from a scam screenshot is checked like a message', () => {
  const r = checkImage('Dear Customer, your SBI YONO account will be\nblocked today. Update PAN KYC immediately:\nhttp: //sbi-yono-kyc.xyz/update');
  assert.equal(r.kind, 'image');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /Suspicious link/);
  assert.equal(r.fpKind, 'message');
});
test('photo: a job screenshot uses the job checks', () => {
  const r = checkImage('From: TCS Recruitment <hr.tcs.careers@gmail.com>\nYou are shortlisted for the TCS online exam. Pay exam fee Rs 1500 to confirm your slot.');
  assert.equal(r.sub, 'job');
  assert.match(titles(r), /pay for a job, exam/);
});
test('photo: a "scan to receive money" QR code is high risk', () => {
  const r = checkImage('Congratulations! Scan this QR to receive your cashback of Rs 5000', 'upi://pay?pa=lucky.winner@ybl&pn=Cashback%20Dept&am=4999');
  assert.equal(r.verdict, 'danger');
  assert.match(titles(r), /QR code you’re told will give you money/);
  assert.equal(r.qr.amount, '₹4,999');
});
test('photo: an ordinary shop UPI QR is a caution, not a scam', () => {
  const q = checkQR('upi://pay?pa=sharmastore@okaxis&pn=Sharma%20Store', 'Sharma General Store');
  assert.equal(q.flags[0].level, 2);
  assert.match(q.flags[0].title, /sends money to “Sharma Store”/);
});
test('photo: QR code links are checked like links', () => {
  const q = checkQR('http://sbi-kyc-update.xyz/login');
  assert.ok(q.flags.some((f) => f.level === 3));
  assert.equal(q.info.type, 'link');
});
test('photo: blank or unreadable pictures are reported, not judged', () => {
  assert.equal(checkImage('  ~ ', null).unreadable, true);
  assert.equal(cleanOcr('visit https : // x.com'), 'visit https : // x.com');
  assert.equal(cleanOcr('visit https:/ /x.com'), 'visit https://x.com');
  assert.equal(cleanOcr('Scan to receive\na\n[=] 0 gL. [=]\nEL Ta\nronn\nyour money now'), 'Scan to receive\nronn\nyour money now');
});
