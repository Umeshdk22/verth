// Reminders: who gets a notification or a "come back" email, and that the push messages are
// encrypted and signed exactly as browsers expect (RFC 8291 / RFC 8292).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPush, pickMail, encryptPush, vapidAuth, sendPush, runNudges, unsubToken, istDayOf, handle } from '../worker/src/index.js';

const enc = new TextEncoder(), b64u = (b) => Buffer.from(b).toString('base64url'), unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const DAY = 86400000, IST = 19800000;
const at = (day, hour) => day * DAY - IST + hour * 3600000; // an India-time moment
const T = istDayOf(Date.UTC(2026, 10, 3, 12));
const now19 = at(T, 19);

// A VAPID key pair for the server.
const vk = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const env = { VAPID_PUBLIC_KEY: b64u(await crypto.subtle.exportKey('raw', vk.publicKey)), VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', vk.privateKey)).d, OTP_SECRET: 's3cret', BREVO_API_KEY: 'k', MAIL_FROM: 'hi@verth.in', FIREBASE_PROJECT_ID: 'p', ALLOWED_ORIGIN: 'https://verth.in' };
// A browser's push keys.
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)), authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', p256dh: b64u(uaPub), auth: b64u(authSecret) };

// What the browser does to read a push message.
const hk = async (salt, ikm, info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
async function browserDecrypt(body) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  assert.equal(new DataView(body.buffer, body.byteOffset).getUint32(16), 4096);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hk(authSecret, secret, new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPub, ...asPub]), 32);
  const cek = await hk(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hk(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  assert.equal(pt.at(-1), 2);
  return new TextDecoder().decode(pt.slice(0, -1));
}

test('push messages are encrypted so only that browser can read them', async () => {
  const msg = JSON.stringify({ title: '🔥 Keep your 5-day streak!', body: 'Open Verth today.' });
  const body = await encryptPush(sub.p256dh, sub.auth, msg);
  assert.equal(await browserDecrypt(body), msg);
  const other = await encryptPush(sub.p256dh, sub.auth, msg);
  assert.notDeepEqual(body.slice(0, 40), other.slice(0, 40)); // fresh salt and key every time
});

test('push requests are signed with the Verth VAPID key for that push service', async () => {
  const h = await vapidAuth(env, sub.endpoint, now19);
  const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, env.VAPID_PUBLIC_KEY);
  const [hd, pl, sig] = t.split('.');
  const claims = JSON.parse(Buffer.from(pl, 'base64url'));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.ok(claims.exp * 1000 > now19 && claims.exp * 1000 <= now19 + 24 * 3600000);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, unb64u(sig), enc.encode(hd + '.' + pl)));
});

test('sendPush posts the encrypted message and spots phones that unsubscribed', async () => {
  let seen;
  const ok = await sendPush(env, sub, { title: 'Hi', body: 'There', tag: 'tip' }, async (url, o) => { seen = { url, o }; return new Response('', { status: 201 }); }, now19);
  assert.equal(ok, 'ok');
  assert.equal(seen.url, sub.endpoint);
  assert.equal(seen.o.headers['content-encoding'], 'aes128gcm');
  assert.deepEqual(JSON.parse(await browserDecrypt(new Uint8Array(seen.o.body))), { title: 'Hi', body: 'There', tag: 'tip' });
  assert.equal(await sendPush(env, sub, { title: 'x' }, async () => new Response('', { status: 410 }), now19), 'gone');
  assert.equal(await sendPush(env, { ...sub, endpoint: 'http://evil.test/' }, { title: 'x' }, async () => assert.fail('must not call'), now19), 'gone');
});

const user = (e = {}, over = {}) => ({ name: 'Priya Nair', email: 'p@x.in', plan: 'free', createdAt: new Date(now19 - 30 * DAY), engage: { day: T - 1, streak: 4, best: 4, installed: true, freq: 'alt', hour: 19, ...e }, ...over });
test('who gets a notification, and which one', () => {
  assert.match(pickPush(user(), null, now19).title, /4-day streak/);
  assert.equal(pickPush(user({ day: T }), null, now19), null, 'already opened today');
  assert.equal(pickPush(user({ freq: 'off' }), null, now19), null, 'turned off');
  assert.equal(pickPush(user(), { lastPush: T - 1 }, now19), null, 'every other day');
  assert.ok(pickPush(user({ freq: 'daily' }), { lastPush: T - 1 }, now19));
  assert.equal(pickPush(user({ freq: 'weekly' }), { lastPush: T - 3 }, now19), null);
  assert.match(pickPush(user({ day: T - 3, streak: 1 }, { createdAt: new Date(now19 - 6 * DAY) }), null, now19).title, /trial ends soon/);
  assert.equal(pickPush(user({ day: T - 3, streak: 1 }, { createdAt: new Date(now19 - 6 * DAY), plan: 'personal' }), null, now19).tag === 'trial', false);
  const tip = pickPush(user({ day: T - 5, streak: 1 }), null, now19);
  assert.match(tip.title, /Priya, got a strange message/);
});

test('the "come back" emails: only after 2, 5, 12 and 30 days, with the trial status', () => {
  assert.equal(pickMail(user(), 3, now19), null);
  const m = pickMail(user({}, { createdAt: new Date(now19 - 3 * DAY) }), 2, now19);
  assert.match(m.subject, /Priya/);
  assert.ok(m.paras.some((p) => /4 days<\/b> left/.test(p)));
  assert.ok(pickMail(user(), 12, now19).paras.some((p) => /trial is over/.test(p)));
  assert.ok(!pickMail(user({}, { plan: 'family' }), 30, now19).paras.some((p) => /trial/.test(p)));
});

/* runNudges against an in-memory database */
function fakeDb(docs) {
  const db = structuredClone(docs), sent = [], mails = [];
  const val = (p, f) => f.split('.').reduce((o, k) => o?.[k], db[p]);
  const fs = {
    get: async (p) => (db[p] ? structuredClone(db[p]) : null),
    set: async (p, d) => { db[p] = structuredClone(d); },
    remove: async (p) => { delete db[p]; },
    list: async (col) => Object.keys(db).filter((p) => p.startsWith(col + '/') && !p.slice(col.length + 1).includes('/')).map((p) => ({ id: p.split('/').pop(), data: db[p] })),
    query: async (q) => {
      const users = Object.keys(db).filter((p) => /^users\/[^/]+$/.test(p));
      const test1 = (p, f) => { const v = val(p, f.field.fieldPath), w = Object.values(f.value)[0]; const x = v instanceof Date ? v.getTime() : v, y = f.value.timestampValue ? new Date(w).getTime() : f.value.integerValue ? Number(w) : w;
        return x !== undefined && ({ EQUAL: x === y, GREATER_THAN_OR_EQUAL: x >= y, LESS_THAN: x < y })[f.op]; };
      const ok = (p) => (q.where.fieldFilter ? test1(p, q.where.fieldFilter) : q.where.compositeFilter.filters.every((f) => test1(p, f.fieldFilter)));
      return users.filter(ok).map((p) => ({ id: p.split('/')[1], data: structuredClone(db[p]) }));
    },
  };
  return { db, fs, sent, mails, mail: { sendComeback: async (to, m) => { mails.push({ to, m }); return true; } } };
}
const pushSub = (ep) => ({ endpoint: 'https://push.example.com/' + ep, p256dh: sub.p256dh, auth: sub.auth });

test('hourly run: notifies people at their chosen time, forgets dead phones, emails people who left', async () => {
  const f = fakeDb({
    'users/a': user(),                                         // streak, 7 pm → push
    'users/a/push/p1': pushSub('ok'), 'users/a/push/p2': pushSub('gone'),
    'users/b': user({ hour: 9 }),                              // 9 am → not now
    'users/b/push/p1': pushSub('ok'),
    'users/c': user({ day: T }),                               // opened today → nothing
    'users/c/push/p1': pushSub('ok'),
  });
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return new Response('', { status: url.endsWith('gone') ? 410 : 201 }); };
  const r = await runNudges(env, { now: now19, fs: f.fs, fetch: fetchFn, mail: f.mail });
  assert.deepEqual({ hour: r.hour, pushed: r.pushed, gone: r.gone }, { hour: 19, pushed: 1, gone: 1 });
  assert.equal(f.db['users/a/push/p2'], undefined);
  assert.equal(f.db['nudges/a'].lastPush, T);
  assert.ok(f.db['users/b/push/p1']);
  // Same hour again: already sent today.
  assert.equal((await runNudges(env, { now: now19 + 60000, fs: f.fs, fetch: fetchFn, mail: f.mail })).pushed, 0);
});

test('6 pm run: "come back" emails go to people away 2/5/12/30 days without push, once, until they unsubscribe', async () => {
  const six = at(T, 18);
  const f = fakeDb({
    'users/a': user({ day: T - 2, hour: 9 }),                       // away 2 days, no push → email
    'users/b': user({ day: T - 5, hour: 9 }),                       // away 5 days but has push → no email
    'users/b/push/p1': pushSub('ok'),
    'users/c': user({ day: T - 3, hour: 9 }),                       // away 3 days → nothing today
    'users/d': { name: 'Old Timer', email: 'd@x.in', plan: 'free', createdAt: new Date(six - 12 * DAY) }, // joined 12 days ago, never back
    'users/e': user({ day: T - 2, hour: 9 }), 'nudges/e': { mailOff: true }, // unsubscribed
  });
  const r = await runNudges(env, { now: six, fs: f.fs, fetch: async () => new Response('', { status: 201 }), mail: f.mail });
  assert.equal(r.mailed, 2);
  assert.deepEqual(f.mails.map((x) => x.to).sort(), ['d@x.in', 'p@x.in']);
  const m = f.mails.find((x) => x.to === 'p@x.in').m;
  assert.match(m.unsubUrl, /\/unsub\?u=a&t=[0-9a-f]{64}$/);
  assert.equal(f.db['nudges/a'].mails, 1);
  assert.equal((await runNudges(env, { now: six + 60000, fs: f.fs, fetch: async () => new Response(''), mail: f.mail })).mailed, 0, 'not twice a day');
  // The unsubscribe link works, and a forged one doesn't.
  const bad = await handle(new Request('https://w.test/unsub?u=a&t=00'), env, { fs: f.fs });
  assert.match(await bad.text(), /isn’t valid/);
  const good = await handle(new Request(m.unsubUrl.replace(/^https:\/\/[^/]+/, 'https://w.test')), env, { fs: f.fs });
  assert.match(await good.text(), /won’t get any more/);
  assert.equal(f.db['nudges/a'].mailOff, true);
  assert.equal(await unsubToken(env, 'a'), m.unsubUrl.split('t=')[1]);
});
