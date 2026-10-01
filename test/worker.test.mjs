// Tests for the payments worker: identity checks, signatures, and plan changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, hmacHex, syncSubscription, verifyIdToken, firestore, toFs, fromFs } from '../worker/src/index.js';

const PROJECT = 'verth-ece65', ORIGIN = 'https://umeshdk22.github.io';
const env = {
  FIREBASE_PROJECT_ID: PROJECT, ALLOWED_ORIGIN: ORIGIN,
  PLAN_PERSONAL: 'plan_P', PLAN_FAMILY: 'plan_F', PLAN_TEAM: 'plan_T',
  RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'keysecret', RAZORPAY_WEBHOOK_SECRET: 'hooksecret',
};

/* ----- a signing key that plays Google's role for ID tokens ----- */
const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString('base64url');
const google = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
async function idToken(claims = {}, key = google.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const p = b64u(JSON.stringify({ iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: 'uidA', email: 'a@x.in', email_verified: true, iat: now, exp: now + 3600, ...claims }));
  return h + '.' + p + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(h + '.' + p)));
}
const jwksFetch = async (url) => { assert.match(url, /securetoken/); return new Response(JSON.stringify({ keys: [jwk] })); };

/* ----- in-memory Firestore and Razorpay ----- */
function fakes(docs = {}) {
  const db = structuredClone(docs), subs = {}, calls = [];
  const fs = {
    get: async (p) => (db[p] ? structuredClone(db[p]) : null),
    update: async (p, data) => { if (!db[p]) throw new Error('missing ' + p); Object.assign(db[p], structuredClone(data)); },
  };
  let n = 0;
  const rp = {
    createSubscription: async (b) => { const id = 'sub_' + ++n; subs[id] = { id, status: 'created', plan_id: b.plan_id, quantity: b.quantity, notes: b.notes, current_end: null }; calls.push(['create', b]); return subs[id]; },
    getSubscription: async (id) => structuredClone(subs[id]),
    cancelAtCycleEnd: async (id) => { calls.push(['cancel', id]); },
  };
  return { db, subs, calls, fs, rp };
}
const req = async (path, body, { token, origin = ORIGIN, headers = {}, raw } = {}) => new Request('https://verth-pay.example.workers.dev' + path, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
  body: raw ?? JSON.stringify(body),
});
const call = async (f, path, body, opts = {}) => {
  const r = await handle(await req(path, body, { token: opts.token ?? (await idToken(opts.claims)), ...opts }), env, { fs: f.fs, rp: f.rp, fetch: jwksFetch });
  return { status: r.status, body: await r.json(), cors: r.headers.get('access-control-allow-origin') };
};
const paidActive = (f, id, extra = {}) => Object.assign(f.subs[id], { status: 'active', current_end: Math.floor(Date.now() / 1000) + 30 * 86400 }, extra);
const checkoutSig = (pid, sid) => hmacHex(env.RAZORPAY_KEY_SECRET, pid + '|' + sid);

/* ---------------- identity ---------------- */
test('ID tokens: real ones pass; forged, expired, wrong project and unverified email fail', async () => {
  assert.equal((await verifyIdToken(await idToken(), PROJECT, jwksFetch)).uid, 'uidA');
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  await assert.rejects(verifyIdToken(await idToken({}, other.privateKey), PROJECT, jwksFetch), /Sign in/);
  await assert.rejects(verifyIdToken(await idToken({ exp: 1000 }), PROJECT, jwksFetch), /Sign in/);
  await assert.rejects(verifyIdToken(await idToken({ aud: 'someone-else' }), PROJECT, jwksFetch), /Sign in/);
  await assert.rejects(verifyIdToken(await idToken({ email_verified: false }), PROJECT, jwksFetch), /Confirm your email/);
  const t = await idToken(); const [h, , s] = t.split('.');
  await assert.rejects(verifyIdToken(h + '.' + b64u(JSON.stringify({ sub: 'uidB', aud: PROJECT })) + '.' + s, PROJECT, jwksFetch), /Sign in/);
});

test('requests from other websites or without sign-in are refused', async () => {
  const f = fakes({ 'users/uidA': { plan: 'free' } });
  const evil = await call(f, '/subscribe', { plan: 'personal' }, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403); assert.equal(evil.cors, null);
  const anon = await handle(await req('/subscribe', { plan: 'personal' }), env, { fs: f.fs, rp: f.rp, fetch: jwksFetch });
  assert.equal(anon.status, 401);
  assert.equal(f.calls.length, 0);
});

/* ---------------- personal plan ---------------- */
test('personal: subscribe → checkout → verify unlocks the plan, only with a valid signature', async () => {
  const f = fakes({ 'users/uidA': { plan: 'free' } });
  const s = await call(f, '/subscribe', { plan: 'personal' });
  assert.equal(s.status, 200); assert.equal(s.cors, ORIGIN);
  assert.equal(s.body.keyId, 'rzp_live_x');
  const sid = s.body.subscriptionId;
  assert.deepEqual(f.calls[0][1].notes, { product: 'personal', uid: 'uidA' });
  assert.equal(f.calls[0][1].plan_id, 'plan_P');

  const bad = await call(f, '/verify', { razorpay_payment_id: 'pay_1', razorpay_subscription_id: sid, razorpay_signature: 'f'.repeat(64) });
  assert.equal(bad.status, 400);
  assert.equal(f.db['users/uidA'].plan, 'free');

  paidActive(f, sid);
  const ok = await call(f, '/verify', { razorpay_payment_id: 'pay_1', razorpay_subscription_id: sid, razorpay_signature: await checkoutSig('pay_1', sid) });
  assert.equal(ok.status, 200); assert.equal(ok.body.paid, true);
  assert.equal(f.db['users/uidA'].plan, 'personal');
  assert.equal(f.db['users/uidA'].billing.subscriptionId, sid);

  const again = await call(f, '/subscribe', { plan: 'personal' });
  assert.equal(again.status, 409);
});

test('ATTACK: someone else’s valid payment can’t unlock your account', async () => {
  const f = fakes({ 'users/uidA': { plan: 'free' }, 'users/uidB': { plan: 'free' } });
  const s = await call(f, '/subscribe', { plan: 'personal' }, { claims: { sub: 'uidB' } });
  const sid = s.body.subscriptionId; paidActive(f, sid);
  const r = await call(f, '/verify', { razorpay_payment_id: 'pay_9', razorpay_subscription_id: sid, razorpay_signature: await checkoutSig('pay_9', sid) });
  assert.equal(r.status, 403);
  assert.equal(f.db['users/uidA'].plan, 'free');
});

test('a subscription made for a different Razorpay plan (e.g. a cheaper one) is ignored', async () => {
  const f = fakes({ 'users/uidA': { plan: 'free' } });
  const r = await syncSubscription({ id: 'sub_x', status: 'active', plan_id: 'plan_cheap', notes: { product: 'personal', uid: 'uidA' } }, f.fs, env);
  assert.equal(r.ignored, true);
  assert.equal(f.db['users/uidA'].plan, 'free');
});

/* ---------------- circles ---------------- */
const circleDocs = (extra = {}) => ({
  'users/uidA': { plan: 'free' }, 'users/uidB': { plan: 'free' },
  'circles/c1': { plan: 'free', memberCount: 4 },
  'circles/c1/members/uidA': { role: 'admin', status: 'active' },
  'circles/c1/members/uidB': { role: 'member', status: 'active' },
  ...extra,
});
test('family and team: only an active admin can buy; Team is one flat price with no limit on people', async () => {
  const f = fakes(circleDocs());
  assert.equal((await call(f, '/subscribe', { plan: 'family', circleId: 'c1' }, { claims: { sub: 'uidB' } })).status, 403);
  const t = await call(f, '/subscribe', { plan: 'team', circleId: 'c1', seats: 999 });
  assert.equal(t.status, 200); assert.equal(t.body.quantity, 1);
  assert.equal(f.calls.at(-1)[1].quantity, 1);
  assert.deepEqual(f.calls.at(-1)[1].notes, { product: 'team', uid: 'uidA', circleId: 'c1' });
  paidActive(f, t.body.subscriptionId);
  await call(f, '/verify', { razorpay_payment_id: 'pay_2', razorpay_subscription_id: t.body.subscriptionId, razorpay_signature: await checkoutSig('pay_2', t.body.subscriptionId) });
  assert.equal(f.db['circles/c1'].plan, 'team');
  assert.equal(f.db['circles/c1'].seats, 2000);
  const big = fakes(circleDocs({ 'circles/c1': { plan: 'free', memberCount: 11 } }));
  assert.match((await call(big, '/subscribe', { plan: 'family', circleId: 'c1' })).body.error, /Team/);
});

/* ---------------- webhooks ---------------- */
async function hook(f, event, sid, { sig } = {}) {
  const raw = JSON.stringify({ event, payload: { subscription: { entity: { id: sid, status: 'cancelled' } } } });
  const r = await handle(await req('/webhook', null, { raw, origin: '', headers: { 'x-razorpay-signature': sig ?? (await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw)) } }), env, { fs: f.fs, rp: f.rp });
  return r.status;
}
test('webhooks: signed events sync the real state; forged ones change nothing', async () => {
  const f = fakes(circleDocs());
  const s = await call(f, '/subscribe', { plan: 'family', circleId: 'c1' });
  const sid = s.body.subscriptionId;
  paidActive(f, sid);
  assert.equal(await hook(f, 'subscription.activated', sid), 200);
  assert.equal(f.db['circles/c1'].plan, 'family');
  assert.equal(f.db['circles/c1'].seats, 10);
  // A forged "cancelled" event is refused.
  f.subs[sid].status = 'cancelled';
  assert.equal(await hook(f, 'subscription.cancelled', sid, { sig: 'a'.repeat(64) }), 400);
  assert.equal(f.db['circles/c1'].plan, 'family');
  // The body says "cancelled", but Razorpay says active: Razorpay wins.
  f.subs[sid].status = 'active';
  assert.equal(await hook(f, 'subscription.cancelled', sid), 200);
  assert.equal(f.db['circles/c1'].plan, 'family');
  // Payment failures exhaust retries → halted → back to free, seats back to 5.
  f.subs[sid].status = 'halted';
  assert.equal(await hook(f, 'subscription.halted', sid), 200);
  assert.equal(f.db['circles/c1'].plan, 'free');
  assert.equal(f.db['circles/c1'].seats, 5);
});

test('cancel: renewals stop, but the paid month is kept', async () => {
  const f = fakes(circleDocs());
  const sid = (await call(f, '/subscribe', { plan: 'personal' })).body.subscriptionId;
  paidActive(f, sid); await hook(f, 'subscription.charged', sid);
  assert.equal((await call(f, '/cancel', { target: 'user' })).status, 200);
  assert.deepEqual(f.calls.at(-1), ['cancel', sid]);
  assert.equal(f.db['users/uidA'].plan, 'personal');
  assert.equal(f.db['users/uidA'].billing.cancelAtEnd, true);
  await hook(f, 'subscription.charged', sid); // a later sync keeps the cancel flag
  assert.equal(f.db['users/uidA'].billing.cancelAtEnd, true);
  // Members can't cancel the circle's plan.
  assert.equal((await call(f, '/cancel', { target: 'circle', circleId: 'c1' }, { claims: { sub: 'uidB' } })).status, 403);
});

test('an old finished subscription can’t switch off a newer paid one', async () => {
  const f = fakes({ 'users/uidA': { plan: 'free' } });
  await syncSubscription({ id: 'sub_new', status: 'active', plan_id: 'plan_P', current_end: Math.floor(Date.now() / 1000) + 86400 * 20, notes: { product: 'personal', uid: 'uidA' } }, f.fs, env);
  await syncSubscription({ id: 'sub_old', status: 'cancelled', plan_id: 'plan_P', notes: { product: 'personal', uid: 'uidA' } }, f.fs, env);
  assert.equal(f.db['users/uidA'].plan, 'personal');
  assert.equal(f.db['users/uidA'].billing.subscriptionId, 'sub_new');
});

/* ---------------- Firestore REST plumbing ---------------- */
test('Firestore REST: service-account sign-in and field-masked updates', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
  const seen = [];
  const fetchFn = async (url, init = {}) => {
    seen.push([url, init]);
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
    if (init.method === 'GET') return new Response(JSON.stringify({ fields: { plan: { stringValue: 'free' }, memberCount: { integerValue: '3' } } }));
    return new Response('{}');
  };
  const fs = firestore({ ...env, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@verth.iam.gserviceaccount.com', private_key: pem }) }, fetchFn);
  assert.deepEqual(await fs.get('circles/c1'), { plan: 'free', memberCount: 3 });
  await fs.update('circles/c1', { plan: 'team', seats: 12 });
  const [url, init] = seen.at(-1);
  assert.match(url, /documents\/circles\/c1\?updateMask\.fieldPaths=plan&updateMask\.fieldPaths=seats&currentDocument\.exists=true$/);
  assert.equal(init.method, 'PATCH');
  assert.equal(init.headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(init.body).fields.seats, { integerValue: '12' });
  const d = new Date('2026-10-01T00:00:00Z');
  assert.deepEqual(fromFs(toFs({ a: 'x', b: 2, c: true, d, e: null })), { a: 'x', b: 2, c: true, d, e: null });
});

/* ---------------- email codes ---------------- */
import { OTP, makeCode, normEmail, firebaseAuth } from '../worker/src/index.js';
const otpEnv = { ...env, OTP_SECRET: 'otp-secret-for-tests', MAIL_FROM: 'codes@verth.test' };
// Firestore stand-in with update times, so preconditions behave like the real thing.
function otpFakes() {
  const db = {}; let clock = 0; const mails = [], authCalls = [];
  const stamp = (p) => { db[p].__t = String(++clock); };
  const check = (p, prev) => {
    if (prev === undefined) return;
    if (prev === null ? !!db[p] : db[p]?.__t !== prev.updateTime) throw Object.assign(new Error('conflict'), { status: 429 });
  };
  const fs = {
    get: async (p) => { if (!db[p]) return null; const { __t, ...o } = structuredClone(db[p]); Object.defineProperty(o, 'updateTime', { value: __t }); return o; },
    set: async (p, data, prev) => { check(p, prev); db[p] = structuredClone(data); stamp(p); },
    update: async (p, data, since) => { if (!db[p] || (since && db[p].__t !== since)) throw new Error('conflict'); Object.assign(db[p], structuredClone(data)); stamp(p); },
  };
  const deps = {
    fs, mail: { sendCode: async (to, code) => { mails.push({ to, code }); } },
    auth: { verifiedUid: async (email) => { authCalls.push(email); return 'uid-' + email.split('@')[0]; }, customToken: async (uid) => 'custom.' + uid },
  };
  return { db, mails, authCalls, deps };
}
const otpCall = async (f, path, body, { now = Date.now(), ip = '1.2.3.4', origin = ORIGIN } = {}) => {
  const r = await handle(new Request('https://w.example' + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), otpEnv, { ...f.deps, now });
  return { status: r.status, body: await r.json() };
};

test('email codes: send, then the right code signs in once', async () => {
  const f = otpFakes();
  const s = await otpCall(f, '/otp/send', { email: '  Asha@Example.IN ' });
  assert.equal(s.status, 200);
  assert.equal(f.mails.length, 1); assert.equal(f.mails[0].to, 'asha@example.in'); assert.match(f.mails[0].code, /^\d{6}$/);
  // The email address and the code are never stored as they are.
  const stored = JSON.stringify(f.db);
  assert.ok(!stored.includes('asha@example.in') && !stored.includes(f.mails[0].code));
  const v = await otpCall(f, '/otp/verify', { email: 'asha@example.in', code: f.mails[0].code });
  assert.equal(v.status, 200); assert.equal(v.body.token, 'custom.uid-asha');
  const again = await otpCall(f, '/otp/verify', { email: 'asha@example.in', code: f.mails[0].code });
  assert.equal(again.status, 400, 'a code works only once');
});

test('email codes: wrong guesses are limited, and codes expire', async () => {
  const f = otpFakes(), t0 = Date.now();
  await otpCall(f, '/otp/send', { email: 'a@b.in' }, { now: t0 });
  const real = f.mails[0].code, wrong = real === '000000' ? '111111' : '000000';
  for (let i = 1; i <= OTP.maxTries; i++) {
    const r = await otpCall(f, '/otp/verify', { email: 'a@b.in', code: wrong }, { now: t0 + i });
    assert.equal(r.status, 400); assert.match(r.body.error, i < OTP.maxTries ? /(try|tries) left/ : /Too many wrong tries/);
  }
  const blocked = await otpCall(f, '/otp/verify', { email: 'a@b.in', code: real }, { now: t0 + 10 });
  assert.equal(blocked.status, 429, 'even the right code is refused after too many wrong ones');
  assert.equal(f.authCalls.length, 0);
  // A new code (after the resend wait) works, but not after 10 minutes.
  await otpCall(f, '/otp/send', { email: 'a@b.in' }, { now: t0 + OTP.resendMs + 1 });
  const late = await otpCall(f, '/otp/verify', { email: 'a@b.in', code: f.mails[1].code }, { now: t0 + OTP.resendMs + OTP.ttlMs + 2 });
  assert.equal(late.status, 400); assert.match(late.body.error, /expired/);
});

test('email codes: guesses at the same moment cannot get around the try limit', async () => {
  const f = otpFakes(), t0 = Date.now();
  await otpCall(f, '/otp/send', { email: 'a@b.in' }, { now: t0 });
  const real = f.mails[0].code;
  const guesses = Array.from({ length: 40 }, (_, i) => String((Number(real) + 1 + i) % 1e6).padStart(6, '0'));
  const rs = await Promise.all(guesses.map((code) => otpCall(f, '/otp/verify', { email: 'a@b.in', code }, { now: t0 + 1 })));
  assert.ok(rs.every((r) => r.status !== 200));
  const counted = f.db[Object.keys(f.db).find((k) => k.startsWith('otp/'))].tries;
  assert.ok(counted <= OTP.maxTries);
});

test('email codes: resend wait, per-email and per-network limits', async () => {
  const f = otpFakes(); let t = Date.now();
  assert.equal((await otpCall(f, '/otp/send', { email: 'x@y.in' }, { now: t })).status, 200);
  assert.equal((await otpCall(f, '/otp/send', { email: 'x@y.in' }, { now: t + 1000 })).status, 429, 'must wait 30 seconds');
  for (let i = 1; i < OTP.perEmailHour; i++) assert.equal((await otpCall(f, '/otp/send', { email: 'x@y.in' }, { now: (t += OTP.resendMs + 1) })).status, 200);
  const r = await otpCall(f, '/otp/send', { email: 'x@y.in' }, { now: (t += OTP.resendMs + 1) });
  assert.equal(r.status, 429); assert.match(r.body.error, /this email/);
  assert.equal((await otpCall(f, '/otp/send', { email: 'x@y.in' }, { now: t + 3600_000 })).status, 200, 'the hour resets');
  const g = otpFakes(), t1 = Date.now();
  for (let i = 0; i < OTP.perIpHour; i++) assert.equal((await otpCall(g, '/otp/send', { email: `p${i}@q.in` }, { now: t1 })).status, 200);
  const n = await otpCall(g, '/otp/send', { email: 'last@q.in' }, { now: t1 });
  assert.equal(n.status, 429); assert.match(n.body.error, /network/);
  assert.equal((await otpCall(g, '/otp/send', { email: 'last@q.in' }, { now: t1, ip: '9.9.9.9' })).status, 200);
});

test('email codes: bad input and other websites are refused', async () => {
  const f = otpFakes();
  assert.equal((await otpCall(f, '/otp/send', { email: 'not-an-email' })).status, 400);
  assert.equal((await otpCall(f, '/otp/send', { email: 'a@b.in' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await otpCall(f, '/otp/verify', { email: 'a@b.in', code: '12' })).status, 400);
  assert.equal(f.mails.length, 0);
  assert.throws(() => normEmail('a b@c.in')); assert.equal(normEmail('A@B.IN'), 'a@b.in');
  const codes = new Set(Array.from({ length: 200 }, makeCode));
  assert.ok([...codes].every((c) => /^\d{6}$/.test(c)) && codes.size > 190);
});

test('email codes: sign-in token and account lookup talk to Firebase correctly', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64') + '\n-----END PRIVATE KEY-----\n';
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push([url, init?.body ? JSON.parse(init.body.startsWith('grant') ? '{}' : init.body) : null]);
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
    if (url.endsWith('accounts:lookup')) return new Response(JSON.stringify(JSON.parse(init.body).email[0] === 'old@x.in' ? { users: [{ localId: 'old1', emailVerified: false }] } : {}));
    if (url.endsWith('accounts:update')) return new Response('{}');
    if (url.endsWith('/accounts')) return new Response(JSON.stringify({ localId: 'new1' }));
    return new Response('{}', { status: 404 });
  };
  const fa = firebaseAuth({ ...otpEnv, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@verth-ece65.iam.gserviceaccount.com', private_key: pem }) }, fetchFn);
  assert.equal(await fa.verifiedUid('old@x.in'), 'old1');
  assert.deepEqual(seen.find(([u]) => u.endsWith('accounts:update'))[1], { localId: 'old1', emailVerified: true });
  assert.equal(await fa.verifiedUid('new@x.in'), 'new1');
  assert.deepEqual(seen.find(([u]) => u.endsWith('/accounts'))[1], { email: 'new@x.in', emailVerified: true });
  const tok = await fa.customToken('new1');
  const [h, p, s] = tok.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.uid, 'new1'); assert.equal(claims.iss, 'sa@verth-ece65.iam.gserviceaccount.com');
  assert.equal(claims.aud, 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit');
  assert.ok(claims.exp - claims.iat <= 3600);
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + p)));
});
