// Verth payments: a small Cloudflare Worker between the Verth app, Razorpay and Firebase.
//
// Why it exists: the Razorpay key secret and the Firebase service account must never reach a
// browser. This worker holds them and is the ONLY thing that can mark a plan as paid.
//
// Routes (all POST):
//   /subscribe  signed-in user starts a subscription → returns { subscriptionId, keyId }
//   /verify     after Razorpay Checkout → checks the payment signature, then syncs the plan
//   /cancel     stop renewing at the end of the paid month
//   /webhook    Razorpay events (signed with the webhook secret) → syncs the plan
//
// Every change is derived from the subscription as Razorpay reports it (fetched with the key
// secret), never from what the browser says. Webhook bodies are only a trigger.
//
// Secrets (wrangler secret put …): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
// FIREBASE_SERVICE_ACCOUNT (the whole JSON key file).
// Vars (wrangler.toml): FIREBASE_PROJECT_ID, ALLOWED_ORIGIN, PLAN_PERSONAL, PLAN_FAMILY, PLAN_TEAM.

const enc = new TextEncoder();
const PAID_STATUSES = ['authenticated', 'active', 'pending'];
export const PRODUCTS = {
  personal: { target: 'user', envKey: 'PLAN_PERSONAL', label: 'Verth Personal (₹29 / month)' },
  family: { target: 'circle', envKey: 'PLAN_FAMILY', label: 'Verth Family (₹49 / month)', maxMembers: 10 },
  team: { target: 'circle', envKey: 'PLAN_TEAM', label: 'Verth Team (₹99 / person / month)', maxMembers: 500 },
};
const TOTAL_COUNT = 120; // monthly cycles: 10 years, Razorpay's maximum for most methods

/* ---------- small helpers ---------- */
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o) => b64url(enc.encode(JSON.stringify(o)));
function fromB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}
// Constant-time comparison, so a forged signature can't be guessed byte by byte.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ---------- Firebase ID tokens (who is calling) ---------- */
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { at: 0, keys: [] };
export async function verifyIdToken(token, projectId, fetchFn = fetch, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Sign in again.');
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))); claims = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))); }
  catch { throw new HttpError(401, 'Sign in again.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'Sign in again.');
  if (now - jwksCache.at > 3600_000 || !jwksCache.keys.some((k) => k.kid === header.kid)) {
    const r = await fetchFn(JWKS_URL);
    if (!r.ok) throw new HttpError(503, 'Try again in a minute.');
    jwksCache = { at: now, keys: (await r.json()).keys || [] };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'Sign in again.');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  const t = Math.floor(now / 1000);
  if (!ok || claims.aud !== projectId || claims.iss !== 'https://securetoken.google.com/' + projectId
    || !claims.sub || typeof claims.exp !== 'number' || claims.exp < t || claims.iat > t + 300) throw new HttpError(401, 'Sign in again.');
  if (claims.email_verified !== true) throw new HttpError(403, 'Confirm your email first.');
  return { uid: claims.sub, email: claims.email || '', name: claims.name || '' };
}

/* ---------- Firestore (admin access through the REST API) ---------- */
let tokenCache = { exp: 0, token: '' };
async function googleAccessToken(sa, fetchFn, now = Date.now()) {
  if (tokenCache.token && tokenCache.exp - 60_000 > now) return tokenCache.token;
  const iat = Math.floor(now / 1000);
  const unsigned = b64urlJson({ alg: 'RS256', typ: 'JWT' }) + '.' + b64urlJson({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  });
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', fromB64url(pem.replace(/\+/g, '-').replace(/\//g, '_')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const jwt = unsigned + '.' + b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned)));
  const r = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
  });
  if (!r.ok) throw new Error('google token ' + r.status);
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: now + j.expires_in * 1000 };
  return j.access_token;
}

export function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
  throw new Error('unsupported value');
}
export function fromFs(f) {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('timestampValue' in f) return new Date(f.timestampValue);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(fromFs);
  return undefined;
}

export function firestore(env, fetchFn = fetch) {
  const sa = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) : env.FIREBASE_SERVICE_ACCOUNT;
  const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
  const call = async (method, path, body) => {
    const r = await fetchFn(base + path, {
      method, headers: { authorization: 'Bearer ' + (await googleAccessToken(sa, fetchFn)), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`firestore ${method} ${r.status}`);
    return r.json();
  };
  return {
    async get(path) {
      const d = await call('GET', path);
      return d ? fromFs({ mapValue: { fields: d.fields || {} } }) : null;
    },
    // Updates only the named fields, and only if the document already exists.
    async update(path, data) {
      const mask = Object.keys(data).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)]));
      return call('PATCH', `${path}?${mask}&currentDocument.exists=true`, { fields });
    },
  };
}

/* ---------- Razorpay ---------- */
export function razorpay(env, fetchFn = fetch) {
  const auth = 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET);
  const call = async (method, path, body) => {
    const r = await fetchFn('https://api.razorpay.com/v1/' + path, {
      method, headers: { authorization: auth, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status >= 500 ? 502 : 400, j?.error?.description || 'Payment provider error.');
    return j;
  };
  return {
    createSubscription: (b) => call('POST', 'subscriptions', b),
    getSubscription: (id) => call('GET', 'subscriptions/' + encodeURIComponent(id)),
    cancelAtCycleEnd: (id) => call('POST', `subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 1 }),
  };
}

/* ---------- the business rules ---------- */
const isPaid = (b, now = Date.now()) => !!b && PAID_STATUSES.includes(b.status) && (!b.currentEnd || new Date(b.currentEnd).getTime() > now - 3 * 86400_000);

// Writes the plan that follows from the subscription's real state. Safe to run any number of times.
export async function syncSubscription(sub, fs, env) {
  const n = sub.notes || {};
  const product = PRODUCTS[n.product];
  if (!product || !n.uid || sub.plan_id !== env[product.envKey]) return { ignored: true }; // not a Verth subscription
  const paid = PAID_STATUSES.includes(sub.status);
  const billing = {
    product: n.product, subscriptionId: sub.id, status: sub.status, payerUid: n.uid,
    currentEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
    seats: Number(sub.quantity) || 1, updatedAt: new Date(),
  };
  if (product.target === 'user') {
    const u = await fs.get('users/' + n.uid);
    if (!u) return { ignored: true };
    // An older, finished subscription must not switch off a newer one.
    if (u.billing?.subscriptionId && u.billing.subscriptionId !== sub.id && isPaid(u.billing) && !paid) return { ignored: true };
    await fs.update('users/' + n.uid, { plan: paid ? 'personal' : 'free', billing: { ...billing, cancelAtEnd: !!(u.billing?.subscriptionId === sub.id && u.billing.cancelAtEnd && paid) } });
    return { target: 'user', paid };
  }
  const c = await fs.get('circles/' + n.circleId);
  if (!c) return { ignored: true };
  if (c.billing?.subscriptionId && c.billing.subscriptionId !== sub.id && isPaid(c.billing) && !paid) return { ignored: true };
  await fs.update('circles/' + n.circleId, {
    plan: paid ? n.product : 'free',
    seats: paid ? (n.product === 'team' ? billing.seats : product.maxMembers) : 5,
    billing: { ...billing, cancelAtEnd: !!(c.billing?.subscriptionId === sub.id && c.billing.cancelAtEnd && paid) },
  });
  return { target: 'circle', paid };
}

async function subscribe(body, user, env, fs, rp) {
  const product = PRODUCTS[body.plan];
  if (!product) throw new HttpError(400, 'Unknown plan.');
  const notes = { product: body.plan, uid: user.uid };
  let quantity = 1;
  if (product.target === 'user') {
    const u = await fs.get('users/' + user.uid);
    if (!u) throw new HttpError(404, 'Finish setting up your account first.');
    if (isPaid(u.billing) || (u.plan && u.plan !== 'free')) throw new HttpError(409, 'You already have a paid plan.');
  } else {
    const cid = String(body.circleId || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cid)) throw new HttpError(400, 'Choose a circle first.');
    const [c, m] = await Promise.all([fs.get('circles/' + cid), fs.get(`circles/${cid}/members/${user.uid}`)]);
    if (!c || !m || m.role !== 'admin' || m.status !== 'active') throw new HttpError(403, 'Only an admin of this circle can choose its plan.');
    if (isPaid(c.billing) || (c.plan && c.plan !== 'free')) throw new HttpError(409, 'This circle already has a paid plan.');
    const count = Number(c.memberCount) || 1;
    if (body.plan === 'family' && count > product.maxMembers) throw new HttpError(400, `Family covers up to ${product.maxMembers} people. Choose Team instead.`);
    if (body.plan === 'team') {
      quantity = Math.floor(Number(body.seats) || count);
      if (quantity < count || quantity > product.maxMembers) throw new HttpError(400, `Choose between ${count} and ${product.maxMembers} people.`);
    }
    notes.circleId = cid;
  }
  const sub = await rp.createSubscription({
    plan_id: env[product.envKey], total_count: TOTAL_COUNT, quantity, customer_notify: true,
    expire_by: Math.floor(Date.now() / 1000) + 3600, notes,
  });
  return { subscriptionId: sub.id, keyId: env.RAZORPAY_KEY_ID, description: product.label, quantity };
}

async function verify(body, user, env, fs, rp) {
  const { razorpay_payment_id: pid, razorpay_subscription_id: sid, razorpay_signature: sig } = body;
  if (![pid, sid, sig].every((x) => typeof x === 'string' && x.length < 200)) throw new HttpError(400, 'Missing payment details.');
  if (!safeEqual(await hmacHex(env.RAZORPAY_KEY_SECRET, pid + '|' + sid), sig)) throw new HttpError(400, 'Payment signature didn’t match.');
  const sub = await rp.getSubscription(sid);
  if (sub.notes?.uid !== user.uid) throw new HttpError(403, 'This payment belongs to a different account.');
  const r = await syncSubscription(sub, fs, env);
  return { status: sub.status, paid: !!r.paid, product: sub.notes.product };
}

async function cancel(body, user, env, fs, rp) {
  const path = body.target === 'circle' ? 'circles/' + String(body.circleId || '') : 'users/' + user.uid;
  if (body.target === 'circle') {
    if (!/^circles\/[A-Za-z0-9_-]{1,64}$/.test(path)) throw new HttpError(400, 'Choose a circle first.');
    const m = await fs.get(`${path}/members/${user.uid}`);
    if (!m || m.role !== 'admin' || m.status !== 'active') throw new HttpError(403, 'Only an admin can change the plan.');
  }
  const doc = await fs.get(path);
  const sid = doc?.billing?.subscriptionId;
  if (!sid || !isPaid(doc.billing)) throw new HttpError(400, 'There’s no active subscription to cancel.');
  await rp.cancelAtCycleEnd(sid);
  await fs.update(path, { billing: { ...doc.billing, cancelAtEnd: true, updatedAt: new Date() } });
  return { cancelAtEnd: true, until: doc.billing.currentEnd };
}

async function webhook(raw, headers, env, fs, rp) {
  const sig = headers.get('x-razorpay-signature') || '';
  if (!safeEqual(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), sig)) throw new HttpError(400, 'bad signature');
  let event;
  try { event = JSON.parse(raw); } catch { throw new HttpError(400, 'bad body'); }
  const sid = event?.payload?.subscription?.entity?.id;
  if (!sid || !String(event.event || '').startsWith('subscription.')) return { ignored: true };
  // Re-read the subscription from Razorpay so the state is always current, whatever order events arrive in.
  return syncSubscription(await rp.getSubscription(sid), fs, env);
}

/* ---------- HTTP ---------- */
function cors(env, origin) {
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? {
    'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600', vary: 'origin',
  } : {};
}
const json = (data, status, extra) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } });

export async function handle(request, env, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const url = new URL(request.url);
  const origin = request.headers.get('origin') || '';
  const h = cors(env, origin);
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: h['access-control-allow-origin'] ? 204 : 403, headers: h });
    if (request.method !== 'POST') return json({ error: 'Not found.' }, 404, h);
    const fs = deps.fs || firestore(env, fetchFn), rp = deps.rp || razorpay(env, fetchFn);
    const raw = await request.text();
    if (raw.length > 100_000) throw new HttpError(413, 'Too large.');
    if (url.pathname === '/webhook') return json(await webhook(raw, request.headers, env, fs, rp), 200);

    // Everything else comes from the Verth app, in the browser of a signed-in person.
    if (!h['access-control-allow-origin']) throw new HttpError(403, 'Not allowed.');
    const user = await verifyIdToken((request.headers.get('authorization') || '').replace(/^Bearer /, ''), env.FIREBASE_PROJECT_ID, fetchFn);
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'Bad request.'); }
    const route = { '/subscribe': subscribe, '/verify': verify, '/cancel': cancel }[url.pathname];
    if (!route) throw new HttpError(404, 'Not found.');
    return json(await route(body, user, env, fs, rp), 200, h);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return json({ error: status === 500 ? 'Something went wrong. Try again in a minute.' : e.message }, status, h);
  }
}

export default { fetch: (request, env) => handle(request, env) };
