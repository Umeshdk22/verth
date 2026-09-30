// Unit tests for the scam checker, using real-world style examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLink, checkPhone, checkMessage, detectKind, registeredDomain, fingerprint } from '../src/scamcheck.js';

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
