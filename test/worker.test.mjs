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
test('family and team: only an active admin can buy, seats are checked', async () => {
  const f = fakes(circleDocs());
  assert.equal((await call(f, '/subscribe', { plan: 'family', circleId: 'c1' }, { claims: { sub: 'uidB' } })).status, 403);
  assert.equal((await call(f, '/subscribe', { plan: 'team', circleId: 'c1', seats: 2 })).status, 400);
  assert.equal((await call(f, '/subscribe', { plan: 'team', circleId: 'c1', seats: 501 })).status, 400);
  const t = await call(f, '/subscribe', { plan: 'team', circleId: 'c1', seats: 12 });
  assert.equal(t.status, 200); assert.equal(t.body.quantity, 12);
  assert.deepEqual(f.calls.at(-1)[1].notes, { product: 'team', uid: 'uidA', circleId: 'c1' });
  paidActive(f, t.body.subscriptionId);
  await call(f, '/verify', { razorpay_payment_id: 'pay_2', razorpay_subscription_id: t.body.subscriptionId, razorpay_signature: await checkoutSig('pay_2', t.body.subscriptionId) });
  assert.equal(f.db['circles/c1'].plan, 'team');
  assert.equal(f.db['circles/c1'].seats, 12);
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
