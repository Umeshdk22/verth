// "Warn your family" messages: only real findings, links unclickable, private numbers hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/scamcheck.js';
import { shareable, shareText, safeExcerpt, defang } from '../src/share.js';

const run = (kind, text, flagged = 0) => { const r = check(kind, text); r.input = text; return { r, ok: shareable(r, flagged), text: shareable(r, flagged) ? shareText(r, flagged) : '' }; };

test('a scam message can be shared; its link is made unclickable and private numbers are hidden', () => {
  const { ok, text } = run('message', 'Dear customer, your SBI KYC has expired. Account XX4321 will be blocked today. Update now: http://sbi-kyc-update.in/login OTP 482913 call 9876543210 mail help@sbi-care.com');
  assert.ok(ok);
  assert.match(text, /Scam alert/);
  assert.match(text, /sbi-kyc-update\[\.\]in/);
  for (const leak of ['sbi-kyc-update.in', 'http://', '4321', '482913', '9876543210', 'help@sbi-care.com']) assert.ok(!text.includes(leak), 'leaked ' + leak);
  assert.match(text, /https:\/\/verth\.in$/);
});
test('rupee amounts stay so family recognise the message', () => {
  assert.match(safeExcerpt('Pay registration fee Rs 2500 or ₹4999 now. OTP 123456'), /Rs 2500.*₹4999.*OTP ••••/);
});
test('a clean result is never shared as an alert', () => {
  assert.equal(run('message', 'Your OTP for login is 482913. Do not share it with anyone. - HDFC Bank').ok, false);
  assert.equal(run('link', 'https://www.google.com').ok, false);
  assert.equal(run('phone', '+91 6283717436').ok, false);
});
test('typing mistakes are not findings', () => {
  assert.equal(run('phone', 'abc').ok, false);
  assert.equal(run('link', 'not a link at all').ok, false);
});
test('a number already rated high risk by several checks can be shared, without the clean-check notes', () => {
  const { ok, text } = run('phone', '+91 6283717436', 3);
  assert.ok(ok);
  assert.match(text, /Rated high risk in 3 earlier Verth checks/);
  assert.ok(!/Ordinary mobile number/i.test(text));
});
test('a possible risk says "Be careful", not "scam"', () => {
  const { ok, text } = run('message', "Hi, it's your manager. I'm in a meeting, can't talk. Please pay this vendor ₹48,000 urgently");
  assert.ok(ok);
  assert.match(text, /Be careful/);
  assert.ok(!/Scam alert/.test(text));
});
test('defang keeps amounts and versions readable', () => {
  assert.equal(defang('sbi-yono-kyc.xyz, Rs.500, v1.2'), 'sbi-yono-kyc[.]xyz, Rs.500, v1.2');
});
test('share text stays short enough for a WhatsApp link', () => {
  const { text } = run('message', 'URGENT '.repeat(200) + ' your KYC expired http://a-b.xyz pay now OTP');
  assert.ok(encodeURIComponent(text).length < 4000);
});
test('UPI IDs in the message are hidden', () => {
  const t = safeExcerpt('Approve the collect request from priya.nair@okaxis or 9876543210@ybl to get your refund');
  assert.ok(!t.includes('priya.nair') && !t.includes('9876543210'), t);
  assert.match(t, /\[UPI ID\]/);
});
test('Hindi messages keep their words', () => {
  const t = safeExcerpt('आपका बैंक खाता आज बंद हो जाएगा। KYC अपडेट करें: http://sbi-kyc.xyz OTP 123456');
  assert.match(t, /आपका बैंक खाता/); assert.ok(!t.includes('123456') && !t.includes('sbi-kyc.xyz'));
});
