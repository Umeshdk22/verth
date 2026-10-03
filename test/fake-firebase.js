// Test-only stand-in for the Firebase SDK. Data lives in localStorage and changes
// are broadcast between tabs, so two pages can act as two people in real time.
// Not shipped: the production build uses the real Firebase SDK.

const LS = window.localStorage;
const bc = new BroadcastChannel('fakefire');
const listeners = new Set();

export class Timestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(Date.now()); }
  toMillis() { return this.ms; }
}
const SERVER_TS = { __s: 'ts' };
export const serverTimestamp = () => SERVER_TS;
export const increment = (n) => ({ __s: 'inc', n });
export const arrayUnion = (...v) => ({ __s: 'union', v });
export const arrayRemove = (...v) => ({ __s: 'remove', v });

function load() { try { return JSON.parse(LS.getItem('fakefs') || '{}'); } catch { return {}; } }
function revive(v) {
  if (v && typeof v === 'object') {
    if ('__ts' in v) return new Timestamp(v.__ts);
    if (Array.isArray(v)) return v.map(revive);
    const o = {}; for (const k in v) o[k] = revive(v[k]); return o;
  }
  return v;
}
function freeze(v) {
  if (v instanceof Timestamp) return { __ts: v.ms };
  if (v === SERVER_TS) return { __ts: Date.now() };
  if (v && typeof v === 'object') {
    if (Array.isArray(v)) return v.map(freeze);
    const o = {}; for (const k in v) o[k] = freeze(v[k]); return o;
  }
  return v;
}
function save(db) { LS.setItem('fakefs', JSON.stringify(db)); }
function notify() { listeners.forEach((l) => l()); }
bc.onmessage = () => { notify(); setTimeout(notify, 120); };
// localStorage changes reach other tabs asynchronously; the storage event fires once they have.
window.addEventListener('storage', (e) => { if (e.key === 'fakefs' || e.key === 'fakeauth') notify(); });
function commitOps(ops) {
  const db = load();
  for (const op of ops) {
    const cur = db[op.path];
    if (op.type === 'delete') { delete db[op.path]; continue; }
    if (op.type === 'update' && !cur) throw Object.assign(new Error('No document to update: ' + op.path), { code: 'not-found' });
    let next = op.type === 'set' ? {} : { ...cur };
    for (const [k, v] of Object.entries(op.data)) {
      if (v && v.__s === 'inc') next[k] = (cur?.[k] || 0) + v.n;
      else if (v && v.__s === 'union') next[k] = Array.from(new Set([...(cur?.[k] || []), ...v.v]));
      else if (v && v.__s === 'remove') next[k] = (cur?.[k] || []).filter((x) => !v.v.includes(x));
      else next[k] = freeze(v);
    }
    db[op.path] = next;
  }
  save(db); bc.postMessage('x'); setTimeout(notify, 0);
}

let autoId = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10);
export const getFirestore = () => ({});
export const connectFirestoreEmulator = () => {};
export function collection(_db, ...segs) {
  if (_db && _db.path && !segs.length) return { kind: 'col', path: _db.path };
  const base = _db && _db.path ? _db.path + '/' : '';
  return { kind: 'col', path: base + segs.join('/') };
}
export function doc(a, ...segs) {
  if (a && a.kind === 'col' && !segs.length) return { kind: 'doc', path: a.path + '/' + autoId(), get id() { return this.path.split('/').pop(); } };
  const base = a && a.path ? a.path + '/' : '';
  const path = base + segs.join('/');
  return { kind: 'doc', path, id: path.split('/').pop() };
}
export const orderBy = (field, dir = 'asc') => ({ t: 'order', field, dir });
export const limit = (n) => ({ t: 'limit', n });
export const where = (field, op, value) => ({ t: 'where', field, op, value });
export const query = (col, ...c) => ({ kind: 'query', path: col.path, c });

function snapDoc(path) {
  const d = load()[path];
  return { id: path.split('/').pop(), exists: () => !!d, data: () => (d ? revive(d) : undefined) };
}
function runQuery(q) {
  const db = load(), depth = q.path.split('/').length + 1;
  let docs = Object.keys(db).filter((p) => p.startsWith(q.path + '/') && p.split('/').length === depth)
    .map((p) => ({ id: p.split('/').pop(), _d: revive(db[p]), data() { return this._d; } }));
  for (const c of q.c || []) {
    if (c.t === 'where') docs = docs.filter((d) => (c.op === 'array-contains' ? (d._d[c.field] || []).includes(c.value) : c.op === '==' ? d._d[c.field] === c.value : true));
    if (c.t === 'order') docs.sort((a, b) => { const va = a._d[c.field]?.ms ?? a._d[c.field], vb = b._d[c.field]?.ms ?? b._d[c.field]; return (va > vb ? 1 : va < vb ? -1 : 0) * (c.dir === 'desc' ? -1 : 1); });
    if (c.t === 'limit') docs = docs.slice(0, c.n);
  }
  return { docs };
}
export async function getDoc(ref) { return snapDoc(ref.path); }
export async function setDoc(ref, data) { commitOps([{ type: 'set', path: ref.path, data }]); }
export async function updateDoc(ref, data) { commitOps([{ type: 'update', path: ref.path, data }]); }
export function writeBatch() {
  const ops = [];
  return { set: (r, d) => ops.push({ type: 'set', path: r.path, data: d }), update: (r, d) => ops.push({ type: 'update', path: r.path, data: d }), delete: (r) => ops.push({ type: 'delete', path: r.path, data: {} }), commit: async () => commitOps(ops) };
}
export function onSnapshot(ref, cb) {
  const run = () => cb(ref.kind === 'doc' ? snapDoc(ref.path) : runQuery(ref.kind === 'col' ? { path: ref.path, c: [] } : ref));
  listeners.add(run); setTimeout(run, 0);
  return () => listeners.delete(run);
}

/* ---- auth ---- */
const users = () => { try { return JSON.parse(LS.getItem('fakeauth') || '{}'); } catch { return {}; } };
const saveUsers = (u) => LS.setItem('fakeauth', JSON.stringify(u));
const authCbs = new Set();
// Each frame can be signed in as a different person (the video shows two phones in one page).
const CUR = 'fakecur:' + (window.name || '');
function mkUser(rec) {
  if (!rec) return null;
  return {
    uid: rec.uid, email: rec.email, displayName: rec.name, emailVerified: !!users()[rec.email]?.verified,
    async reload() { this.emailVerified = !!users()[rec.email]?.verified; }, async getIdToken() { return 'x'; },
  };
}
const auth = { currentUser: null };
function setCurrent(email) {
  if (email) sessionStorage.setItem(CUR, email); else sessionStorage.removeItem(CUR);
  auth.currentUser = email ? mkUser(users()[email]) : null;
  authCbs.forEach((cb) => cb(auth.currentUser));
}
export const getAuth = () => { auth.currentUser = mkUser(users()[sessionStorage.getItem(CUR)]); return auth; };
export const connectAuthEmulator = () => {};
export function onAuthStateChanged(_a, cb) { authCbs.add(cb); setTimeout(() => cb(auth.currentUser), 0); return () => authCbs.delete(cb); }
const err = (code) => Object.assign(new Error(code), { code });
export async function createUserWithEmailAndPassword(_a, email, pass) {
  const u = users(); if (u[email]) throw err('auth/email-already-in-use');
  if (pass.length < 6) throw err('auth/weak-password');
  u[email] = { uid: 'u_' + autoId().slice(0, 10), email, pass, name: '', verified: false }; saveUsers(u);
  setCurrent(email); return { user: auth.currentUser };
}
export async function signInWithEmailAndPassword(_a, email, pass) {
  const u = users()[email]; if (!u || u.pass !== pass) throw err('auth/invalid-credential');
  setCurrent(email); return { user: auth.currentUser };
}
export async function updateProfile(user, { displayName }) { const u = users(); u[user.email].name = displayName; saveUsers(u); user.displayName = displayName; }
export async function sendEmailVerification() { window.__lastVerificationSent = Date.now(); }
export async function sendPasswordResetEmail() {}
export class GoogleAuthProvider {}
export async function signInWithPopup() {
  const email = window.__googleEmail || 'google.user@gmail.com', u = users();
  if (!u[email]) { u[email] = { uid: 'g_' + autoId().slice(0, 10), email, pass: '', name: window.__googleName || 'Google User', verified: true }; saveUsers(u); }
  setCurrent(email); return { user: auth.currentUser };
}
export async function signOut() { setCurrent(null); }
export async function deleteUser(user) { const u = users(); delete u[user.email]; saveUsers(u); setCurrent(null); }
// Stand-in for a token from the Verth server: the middle part carries { uid, email }.
export async function signInWithCustomToken(_a, token) {
  let c; try { c = JSON.parse(atob(token.split('.')[1])); } catch { throw err('auth/invalid-custom-token'); }
  const u = users();
  if (!u[c.email]) u[c.email] = { uid: c.uid, email: c.email, pass: '', name: '', verified: true };
  u[c.email].verified = true; saveUsers(u);
  setCurrent(c.email); return { user: auth.currentUser };
}
export const initializeApp = () => ({});
window.__fakeVerify = (email) => { const u = users(); if (u[email]) { u[email].verified = true; saveUsers(u); } };

export const initializeAppCheck = () => {};
export class ReCaptchaEnterpriseProvider {}

export async function getCountFromServer(col) { return { data: () => ({ count: runQuery({ path: col.path, c: [] }).docs.length }) }; }
// firebase/ai stand-in (the helper's Gemini mode is off in tests).
export const getAI = () => ({});
export class GoogleAIBackend {}
export const getGenerativeModel = () => ({ startChat: () => ({ sendMessage: async () => ({ response: { text: () => 'test answer' } }) }) });
