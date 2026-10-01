// Unit tests for Verth Helper's understanding of questions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAnswer, looksSensitive, looksLikeSomethingToCheck, extractTarget, TOPICS, aiInstructions } from '../src/helper.js';

const topicOf = (q) => findAnswer(q)?.topic.id;

test('common questions land on the right topic', () => {
  const cases = {
    'how do I sign up': 'signup',
    'account kaise banaye': 'signup',
    'I did not get the verification email': 'email',
    'forgot password': 'signin',
    'how do I add my mom?': 'circle',
    'how will my employees join the company account': 'org',
    'how to link employees with organisation': 'org',
    'still waiting for approval to join': 'join',
    'my son is asking for money from a new number': 'verify',
    'what is the 6 digit code on video call': 'code',
    'how to check a suspicious link': 'scan',
    'I got an exam fee email from TCS': 'job',
    'why only 2 per day': 'limit',
    'how much does the family plan cost': 'plans',
    'how do i install on iphone': 'install',
    'I got a new phone': 'device',
    'how do I leave circle': 'members',
    'I already paid a scammer, money gone': 'lost',
    'CBI says digital arrest on video call': 'arrest',
    'does verth read my whatsapp': 'privacy',
    'is it safe to share otp with bank': 'otp',
    'what is verth': 'what',
    'how to check screenshot': 'photo',
    'photo kaise check kare': 'photo',
    'I dont understand how to use this': 'howto',
    'can i upload image of message': 'photo',
    'how do I cancel my subscription': 'billing',
    'I was charged twice, need refund': 'billing',
    'how much does it cost': 'plans',
    'I paid 1500 for a fake exam, what now?': 'lost',
    'I shared my OTP by mistake': 'lost',
  };
  for (const [q, id] of Object.entries(cases)) assert.equal(topicOf(q), id, q);
});

test('unrelated questions get no guide answer', () => {
  for (const q of ['write my homework essay', 'weather tomorrow', 'x']) assert.equal(findAnswer(q), null, q);
});

test('secrets are caught and never processed', () => {
  for (const q of ['my otp is 482913', 'OTP: 482913', 'upi pin 1234', 'password is Mumbai@123', '4111 1111 1111 1111', 'aadhaar 1234 5678 9012']) assert.ok(looksSensitive(q), q);
  for (const q of ['is it safe to share otp', 'my password is not working', 'forgot password', 'what is the 6 digit code', 'how do I pay ₹29']) assert.ok(!looksSensitive(q), q);
});

test('pasted links, numbers and messages are sent to Scam check', () => {
  assert.equal(looksLikeSomethingToCheck('sbi-kyc-update.xyz/login'), 'link');
  assert.equal(looksLikeSomethingToCheck('https://bit.ly/3abc'), 'link');
  assert.equal(looksLikeSomethingToCheck('+91 98765 43210'), 'phone');
  assert.equal(looksLikeSomethingToCheck('Dear customer, your account will be blocked. Update KYC at http://sbi-kyc.xyz now'), 'message');
  assert.equal(looksLikeSomethingToCheck('From: TCS HR <hr.tcs@gmail.com>\nYou are shortlisted for the online exam. Pay Rs 1500.'), 'job');
  for (const q of ['how do I check a link?', 'what is verth', 'how much is the plan']) assert.equal(looksLikeSomethingToCheck(q), null, q);
});

test('every topic is complete and the AI is limited to the guide', () => {
  const ids = new Set();
  for (const t of TOPICS) {
    assert.ok(t.id && t.q && t.a && t.keys.length, t.id);
    assert.ok(!ids.has(t.id), 'duplicate ' + t.id); ids.add(t.id);
  }
  const p = aiInstructions();
  assert.match(p, /Only use facts from the VERTH GUIDE/);
  assert.match(p, /Never ask for or accept OTPs/);
  assert.match(p, /1930/);
});

test('numbers and links inside a question go to Scam check, with just the number or link', () => {
  assert.equal(looksLikeSomethingToCheck('is 98765 43210 safe?'), 'phone');
  assert.equal(extractTarget('is 98765 43210 safe?', 'phone'), '98765 43210');
  assert.equal(looksLikeSomethingToCheck('this number +91 9876543210 called me, is it fraud'), 'phone');
  assert.equal(looksLikeSomethingToCheck('is sbi-kyc-update.xyz/login safe to open?'), 'link');
  assert.equal(extractTarget('is sbi-kyc-update.xyz/login safe to open?', 'link'), 'sbi-kyc-update.xyz/login');
  assert.equal(looksLikeSomethingToCheck('how do I install on iphone'), null);
});
