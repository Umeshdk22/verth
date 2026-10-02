import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut, updateProfile,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp, writeBatch, arrayUnion, arrayRemove, increment, getCountFromServer,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { makeServerAI } from './ai-client.js';
import { firebaseConfig, PLANS, CHECK_TTL_SECONDS, appCheckSiteKey, AI_HELPER, PAYMENTS } from './config.js';
import { mountHelper } from './helper.js';
import { heroBanner, quoteCarousel, quickTiles, alertShow, stepsShow, rulesGrid, helplineBand, signOff, pageHead, rotate } from './showcase.js';
import { secondsLeft } from './totp.js';
import { check, checkImage, fingerprint, ADVICE, JOB_ADVICE, COMPANIES, detectKind } from './scamcheck.js';
import {
  deviceKeys, samePub, codeFor, checkCode, answerPayload, signAnswer, verifyAnswer, deviceLabel,
} from './devicekeys.js';

/* ---------- refuse to run inside another site's frame (clickjacking) ---------- */
/* global __TEST_ALLOW_FRAME__ */
// (__TEST_ALLOW_FRAME__ exists only in the local video/test build; the live site always refuses frames.)
if (window.top !== window.self && typeof __TEST_ALLOW_FRAME__ === 'undefined') {
  document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">For your safety, Verth can’t be shown inside another website. <a href="https://umeshdk22.github.io/verth/app.html" target="_top">Open Verth directly</a>.</p>';
  throw new Error('framed');
}

/* ---------- setup ---------- */
const params = new URLSearchParams(location.search);
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && params.has('emu');
const cfg = EMU ? { apiKey: 'demo-key', authDomain: 'demo-verth.firebaseapp.com', projectId: 'demo-verth', appId: 'demo' } : firebaseConfig;
const CONFIGURED = EMU || !String(cfg.apiKey).includes('REPLACE');
const APP_URL = 'https://umeshdk22.github.io/verth/app.html';
// Tests can point payments at a stand-in server (local emulator builds only).
const PAY_API = EMU ? params.get('payapi') || '' : PAYMENTS.api;
const NEW_DEVICE_WARN_MS = 7 * 24 * 3600 * 1000;
const CHANNELS = ['WhatsApp', 'Phone call', 'Video call', 'SMS', 'Email', 'In person', 'Other'];

const root = document.getElementById('app');
let auth, db, fbApp;
if (CONFIGURED) {
  const app = (fbApp = initializeApp(cfg));
  if (appCheckSiteKey && !EMU) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  auth = getAuth(app);
  db = getFirestore(app);
  if (EMU) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

// Text shared to Verth from another app (Android share sheet), or a #scan shortcut.
const SHARED = (() => {
  const t = [params.get('share_title'), params.get('share_text'), params.get('share_url')].filter(Boolean).join('\n').trim();
  if (t) {
    try { sessionStorage.setItem('verth-share', t.slice(0, 6000)); } catch {}
    const clean = new URL(location.href); ['share_title', 'share_text', 'share_url'].forEach((k) => clean.searchParams.delete(k));
    history.replaceState(null, '', clean.pathname + clean.search + '#scan');
  }
  let v = '';
  try { v = sessionStorage.getItem('verth-share') || ''; } catch {}
  return v;
})();
// A picture shared to Verth from another app (Android share sheet) waits in the service worker's cache.
let SHARED_IMAGE = params.has('shared_image');
if (SHARED_IMAGE) { const clean = new URL(location.href); clean.searchParams.delete('shared_image'); history.replaceState(null, '', clean.pathname + clean.search + '#scan'); }
async function loadSharedImage() {
  try {
    const c = await caches.open('verth-share'), res = await c.match('shared-image');
    if (!res) return;
    const blob = await res.blob(); await c.delete('shared-image');
    setPhoto(new File([blob], 'shared-picture', { type: blob.type || 'image/jpeg' }), true);
  } catch {}
}
function takeShared() {
  if (SHARED_IMAGE) { SHARED_IMAGE = false; S.scanKind = 'image'; S.scanResult = null; setTimeout(loadSharedImage, 0); return true; }
  const hashKind = (location.hash.match(/^#scan-(image|message|job|link|phone)$/) || [])[1];
  if (hashKind && !SHARED) { S.scanKind = hashKind; S.scanResult = null; history.replaceState(null, '', location.pathname + location.search + '#scan'); return true; }
  if (!SHARED && location.hash !== '#scan') return false;
  if (SHARED) {
    const kind = /\b(exam|interview|recruit|hiring|offer\s+letter|shortlisted|selected|job|placement|internship|hr\b)/i.test(SHARED) && detectKind(SHARED) === 'message' ? 'job' : detectKind(SHARED);
    S.prefill = { kind, text: SHARED }; S.scanKind = kind; S.scanResult = null;
    try { sessionStorage.removeItem('verth-share'); } catch {}
  }
  return true;
}

const S = {
  user: null, profile: null, keys: null, circleId: null, circle: null, circles: {}, pending: [],
  members: [], checks: [], tab: 'home', tourStep: 0, verifyMode: 'push', codeFor: '',
  lastSentId: null, codeResult: null, confirmYes: null, confirmRemove: null,
  seen: new Set(), sig: new Map(), unsubs: [],
  scanKind: 'message', scanResult: null, scanUsed: null, photoUsed: null, photo: null, photoUrl: '', photoBusy: null, photoShared: false, payBusy: null, confirmCancel: null, reports: {}, myReports: new Set(), scanOnly: false, prefill: null,
};

/* ---------- helpers ---------- */
const esc = (t) => String(t ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
const tsMs = (t) => (t instanceof Timestamp ? t.toMillis() : typeof t === 'number' ? t : t?.seconds ? t.seconds * 1000 : t?.ms ? t.ms : Date.now());
const me = () => S.members.find((m) => m.uid === S.user?.uid);
const active = () => S.members.filter((m) => m.status === 'active');
const others = () => active().filter((m) => m.uid !== S.user.uid);
const member = (uid) => S.members.find((m) => m.uid === uid);
const plan = () => PLANS[S.circle?.plan] || PLANS.free;
const isAdmin = () => me()?.role === 'admin' && me()?.status === 'active';
const fmtCode = (c) => (c ? c.slice(0, 3) + ' ' + c.slice(3) : '--- ---');
const fmtInvite = (c) => (c ? esc(c.slice(0, 4) + '-' + c.slice(4)) : '');
const initials = (n) => esc((n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());

function fmtTime(t) {
  const d = new Date(tsMs(t)), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today ' + hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + hm;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm;
}
function ago(ms) {
  const d = Math.max(0, Date.now() - ms), h = Math.floor(d / 3600000);
  return h < 1 ? 'less than an hour ago' : h < 24 ? `${h} hour${h > 1 ? 's' : ''} ago` : `${Math.floor(h / 24)} day${h >= 48 ? 's' : ''} ago`;
}
// A member who registered a new device recently gets flagged everywhere they appear.
function newDevice(m) { return m?.device && m.device.n > 1 && Date.now() - tsMs(m.device.at) < NEW_DEVICE_WARN_MS; }
const deviceWarn = (m) => newDevice(m)
  ? `<div class="warn">${esc(m.name)} started using Verth on a new device (${esc(m.device.label)}) ${ago(tsMs(m.device.at))}. If they didn’t tell you, confirm with them in person before trusting a check.</div>` : '';

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeInviteCode() {
  const out = [];
  while (out.length < 8) {
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    if (b < 248) out.push(INVITE_ALPHABET[b % 31]); // reject to avoid modulo bias
  }
  return out.join('');
}

function friendlyError(e) {
  const c = e?.code || '';
  const map = {
    'verth/slow-down': 'Please wait a few seconds before sending another check.',
    'auth/invalid-custom-token': 'That sign-in didn’t work. Ask for a new code.',
    'auth/user-disabled': 'This account has been switched off. Contact support.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    'auth/network-request-failed': 'You seem to be offline. Check your connection.',
    'permission-denied': 'Verth didn’t allow that. Refresh the page and try again.',
  };
  return map[c] || (e?.otp ? e.message : 'Something went wrong. Try again.');
}

let toastTimer;
function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 4200);
}

// Re-render without losing what the person was typing. Passwords are never restored.
function paint(html) {
  const keep = {};
  root.querySelectorAll('input[id],select[id],textarea[id]').forEach((el) => { if (el.type !== 'password') keep[el.id] = el.value; });
  const focused = document.activeElement?.id;
  root.innerHTML = html;
  S.screen = '';
  clearInterval(resendTimer);
  for (const [id, v] of Object.entries(keep)) {
    const el = document.getElementById(id);
    if (el && v !== '' && el.dataset.keep !== 'no') el.value = v;
  }
  if (focused) document.getElementById(focused)?.focus();
  tick();
}

const ICON = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
  job: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 115 1c-.8.6-2.5 1.2-2.5 2.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.8 3.4-5.6 7-5.6s6.3 1.8 7 5.6"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-2v18M12 8h8v13M2 21h20"/><path d="M7.5 8h1M7.5 12h1M7.5 16h1M15.5 12h1M15.5 16h1"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5-4-5-1.5S10 9 12 9zm0 0c1.5-3.5 5-4 5-1.5S14 9 12 9z"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.6.2 4.4 1.8 5 4.5"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/><path d="M8 7h7"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path d="M8.5 11h5M11 8.5v5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 01-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0012 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 010-4.2V7.1H2.2a11 11 0 000 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 002.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
};

const brand = `<a class="brand" href="./">${ICON.shield}<span>Verth</span></a>`;
const errorScreen = (msg) => paint(`<div class="shell narrow">${brand}<div class="panel"><h1>Couldn’t load your account</h1><p class="muted">${esc(msg)}</p><button class="btn primary" data-act="reload">Try again</button><div class="links"><button class="link" data-act="signout">Sign out</button></div></div></div>`);

/* ---------- auth screens ---------- */
function renderNotConfigured() {
  paint(`<div class="shell narrow">${brand}
    <div class="panel"><h1>Accounts open soon</h1>
    <p class="muted">Verth sign-up is being connected. Meanwhile, you can try the full interactive demo.</p>
    <a class="btn primary" href="demo.html">Try the demo</a></div></div>`);
}

// Log in or sign up: Google, or email + a 6-digit code (no passwords to remember or steal).
let resendTimer;
function renderAuth(note = '') {
  const signup = params.get('mode') === 'signup';
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    <h1>${signup ? 'Create your free account' : 'Log in to Verth'}</h1>
    <p class="muted">${signup ? 'Free for up to 5 people. ' : ''}Enter your email and we’ll send you a 6-digit code. No password needed.</p>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <form data-form="otp-email" class="stack" novalidate>
      <label>Email address<input id="a-email" type="email" inputmode="email" autocomplete="email" required maxlength="120" placeholder="you@example.com" autofocus></label>
      <p class="err" id="a-err" role="alert"></p>
      <button class="btn primary big" type="submit">Send code</button>
    </form>
    <div class="or"><span>or</span></div>
    <button class="btn google" type="button" data-act="google">${ICON.google}Continue with Google</button>
    <p class="muted small center">${signup ? 'Already have an account? Use the same email and you’ll be logged in.' : 'New to Verth? The same steps create your free account.'}</p>
  </div>
  <p class="foot">Want to look around first? <a href="demo.html">Try the demo</a>, no account needed.</p></div>`);
  S.screen = 'auth';
}

function renderCode(note = '') {
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    <h1>Enter your code</h1>
    <p class="muted">We sent a 6-digit code to <b>${esc(S.otpEmail)}</b>. It works for 10 minutes.</p>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <form data-form="otp-code" class="stack" novalidate>
      <label>6-digit code<input id="a-code" class="otp" data-keep="no" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required placeholder="••••••" autofocus></label>
      <p class="err" id="a-err" role="alert"></p>
      <button class="btn primary big" type="submit">Verify and continue</button>
    </form>
    <p class="muted small">Can’t find it? Check your spam or promotions folder.</p>
    <div class="links"><button type="button" class="link" data-act="otp-resend" id="a-resend" disabled>Send a new code</button><button type="button" class="link" data-act="otp-change">Use a different email</button></div>
    <p class="muted small">Never share this code with anyone. Verth will never call or message you to ask for it.</p>
  </div></div>`);
  S.screen = 'code';
  const btn = document.getElementById('a-resend');
  const tickResend = () => {
    const left = Math.ceil((S.otpResendAt - Date.now()) / 1000);
    btn.disabled = left > 0; btn.textContent = left > 0 ? `Send a new code in ${left}s` : 'Send a new code';
    if (left <= 0) clearInterval(resendTimer);
  };
  tickResend(); resendTimer = setInterval(tickResend, 1000);
  const input = document.getElementById('a-code');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) input.form.requestSubmit();
  });
}

function renderName() {
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    <div class="state-icon ok">${ICON.ok}</div>
    <h1>You’re in. What’s your name?</h1>
    <p class="muted">So people in your family or team recognise you when you ask them to confirm something.</p>
    <form data-form="set-name" class="stack" novalidate>
      <label>Your full name<input id="n-name" autocomplete="name" required maxlength="60" placeholder="e.g. Asha Sharma" autofocus></label>
      <p class="err" id="n-err" role="alert"></p>
      <button class="btn primary big" type="submit">Continue</button>
    </form>
  </div></div>`);
}

// Talks to the Verth server for email codes.
async function otpApi(path, body) {
  if (!PAY_API) throw Object.assign(new Error('Email codes aren’t switched on yet. Use Continue with Google for now.'), { otp: true });
  let r;
  try { r = await fetch(PAY_API.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw Object.assign(new Error('You seem to be offline. Check your connection.'), { otp: true }); }
  const j = await r.json().catch(() => ({}));
  // An older server that doesn't know email codes answers "Sign in again." (401).
  if (r.status === 401 || r.status === 404) throw Object.assign(new Error('Email codes aren’t switched on yet. Use Continue with Google for now.'), { otp: true });
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again in a minute.'), { otp: true });
  return j;
}
async function sendCode(email) {
  const j = await otpApi('/otp/send', { email });
  S.otpEmail = email.trim().toLowerCase();
  S.otpResendAt = Date.now() + (j.resendInSeconds || 30) * 1000;
}

/* ---------- onboarding ---------- */
const TOUR = [
  () => `<div class="tour-art">${ICON.shield}</div><h1>Welcome to Verth</h1>
    <p class="lead">Scammers now copy names, profile photos, voices and even faces. Verth checks a request with the <b>real person, on their own phone</b>, before you act on it.</p>`,
  () => `<h1>Use Verth before you…</h1><ul class="uses">
    <li><b>Send money</b> or pay an invoice someone asked for</li>
    <li><b>Change bank details</b> for a vendor, salary or rent</li>
    <li><b>Share an OTP or password</b>, or reset someone’s login</li>
    <li><b>Act on an “emergency”</b> message from family or a boss</li>
    <li><b>Share confidential files</b> or customer data</li></ul>`,
  () => `<h1>How a check works</h1><ol class="how">
    <li><b>A request arrives</b> on WhatsApp, a call, email or video, claiming to be from someone you know.</li>
    <li><b>You tap Verify</b> and pick who it claims to be from.</li>
    <li><b>Their phone asks them</b> “Did you send this?” Their answer is signed by their own device, and you see it in seconds.</li></ol>
    <p class="muted">On a live call, ask for their <b>Verth code</b> instead. It changes every 30 seconds, and only their phone can make it.</p>`,
  () => `<h1>Who do you want to protect?</h1><p class="muted">You can add more circles later.</p>
    <div class="choose">
      <button class="choice" data-act="tour-choose" data-type="org"><b>My organisation</b><span>Accounts, HR, IT help desk and managers verify payment, bank and password requests.</span></button>
      <button class="choice" data-act="tour-choose" data-type="family"><b>My family</b><span>Parents, children and grandparents verify “I lost my phone, send money” and emergency calls.</span></button>
      <button class="choice" data-act="tour-choose" data-type="join"><b>I have an invite code</b><span>Someone already set up a circle and invited you.</span></button>
      <button class="choice" data-act="tour-choose" data-type="scan"><b>Just check something suspicious</b><span>Paste a message, email, link or phone number and see the red flags.</span></button>
    </div>`,
];

function renderTour() {
  const i = S.tourStep, last = i === TOUR.length - 1;
  paint(`<div class="shell narrow">${brand}<div class="panel tour">
    <div class="dots">${TOUR.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
    ${TOUR[i]()}
    <div class="row gap">
      ${i > 0 ? '<button class="btn ghost" data-act="tour-back">Back</button>' : ''}
      ${last ? '' : '<button class="btn primary grow" data-act="tour-next">Next</button>'}
    </div>
    ${i === 0 ? '<div class="links"><button class="link" data-act="tour-skip">Skip the tour</button></div>' : ''}
    ${last && S.pending.length ? `<div class="note">You’re waiting for approval to join ${S.pending.map((p) => esc(p.name)).join(', ')}.</div>` : ''}
  </div></div>`);
}

function renderSetup(type) {
  const fam = type === 'family', join = type === 'join';
  paint(`<div class="shell narrow">${brand}<div class="panel">
    ${join ? `<h1>Join a circle</h1><p class="muted">Enter the 8-character code the circle admin shared with you. The admin approves you before you can see anything.</p>
      <form data-form="join" class="stack" novalidate>
        <label>Invite code<input id="j-code" required maxlength="9" placeholder="ABCD-2345" autocapitalize="characters" autocomplete="off" class="mono"></label>
        <label>How others know you<input id="j-title" required maxlength="40" placeholder="e.g. Accounts, or Son"></label>
        <p class="err" id="s-err" role="alert"></p>
        <button class="btn primary" type="submit">Ask to join</button></form>`
      : `<h1>${fam ? 'Set up your family circle' : 'Set up your organisation'}</h1>
      <p class="muted">${fam ? 'Everyone in the circle can check requests with each other. You approve who joins.' : 'Invite the people who ask for and approve payments, bank changes and access. You approve who joins.'}</p>
      <form data-form="create" class="stack" novalidate>
        <input type="hidden" id="c-type" value="${fam ? 'family' : 'org'}">
        <label>${fam ? 'Family name' : 'Organisation name'}<input id="c-name" required maxlength="60" placeholder="${fam ? 'The Sharma family' : 'Nirmaan Infra'}"></label>
        <label>Your role${fam ? ' in the family' : ''}<input id="c-title" required maxlength="40" placeholder="${fam ? 'e.g. Dad' : 'e.g. Finance head'}"></label>
        <p class="err" id="s-err" role="alert"></p>
        <button class="btn primary" type="submit">Create circle</button></form>`}
    <div class="links"><button class="link" data-act="setup-back">Back</button></div>
  </div></div>`);
}

function renderPending() {
  paint(`<div class="shell narrow">${brand}<div class="panel">
    <div class="state-icon wait">${ICON.wait}</div>
    <h1>Waiting for approval</h1>
    <p class="muted">You asked to join ${S.pending.map((p) => `<b>${esc(p.name)}</b>`).join(', ')}. The circle admin needs to approve you. You’ll see the circle here as soon as they do.</p>
    <p class="muted small">This protects circles from strangers who get hold of an invite code.</p>
    <button class="btn ghost" data-act="scan-only">Check a suspicious message meanwhile</button>
    <button class="btn ghost" data-act="setup" data-type="org">Create my own circle instead</button>
    <div class="links"><button class="link" data-act="setup" data-type="join">Use a different code</button><button class="link" data-act="signout">Sign out</button></div>
  </div></div>`);
}

/* ---------- main app ---------- */
const TABS = [
  ['home', 'Home', ICON.home], ['scan', 'Scan', ICON.scan], ['verify', 'Verify', ICON.check],
  ['circle', 'Circle', ICON.people], ['log', 'Log', ICON.log], ['plan', 'Plan', ICON.star],
];

const isExpired = (c) => c.status === 'pending' && tsMs(c.expiresAt) < Date.now();
// A "confirmed" answer only counts when its device signature checks out.
function statusOf(c) {
  if (isExpired(c)) return 'expired';
  if (c.status === 'confirmed' && S.sig.get(c.id) !== true) return S.sig.has(c.id) ? 'unsigned' : 'checking';
  return c.status;
}
const STATUS = {
  pending: ['wait', 'Waiting'], confirmed: ['ok', 'Confirmed'], denied: ['bad', 'Denied'], expired: ['wait', 'No answer'],
  unsigned: ['bad', 'Untrusted answer'], checking: ['wait', 'Checking signature'],
  'code-match': ['ok', 'Code matched'], 'code-mismatch': ['bad', 'Code wrong'],
};
const pill = (c) => { const [k, t] = STATUS[statusOf(c)] || ['wait', 'Unknown']; return `<span class="pill ${k}">${esc(t)}${c.reported ? ' · reported' : ''}</span>`; };

function monthChecks() {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  return S.checks.filter((c) => c.fromUid === S.user.uid && tsMs(c.createdAt) >= start.getTime()).length;
}
const thisDeviceActive = () => !!(S.keys && me()?.device && samePub(S.keys.pub.sig, me().device.sig) && samePub(S.keys.pub.dh, me().device.dh));

function renderMain() {
  if (!S.circle || !me()) return;
  S.scanOnly = false;
  const circles = Object.entries(S.circles);
  const HEAD = {
    scan: ['Scam check', 'Is it real or a scam?', 'Check a message, job offer, link, number or screenshot in seconds.', 'scan', 'violet'],
    verify: ['Verify', 'Is it really them?', 'Ask the real person on their own phone, or check the code they read out.', 'shield', 'amber'],
    circle: [S.circle.type === 'family' ? 'Your family' : 'Your organisation', 'Your people', 'Invite, approve and manage who is in this circle.', 'family', 'teal'],
    log: ['Verification log', 'Every check, on record', 'A permanent history of who checked what, and what they answered.', 'chart', 'violet'],
    plan: ['Plan & account', 'Plans and billing', 'Your plan, your subscription and this device.', 'key', 'amber'],
    guide: ['Guide', 'How Verth keeps you safe', 'Real examples of when to check, and how.', 'heart', 'teal'],
  }[S.tab];
  const body = (HEAD ? pageHead(...HEAD) : '') + { home: viewHome, scan: viewScan, verify: viewVerify, circle: viewCircle, log: viewLog, guide: viewGuide, plan: viewPlan }[S.tab]();
  const waiting = isAdmin() ? S.members.filter((m) => m.status === 'pending').length : 0;
  paint(`<div class="app">
    <header class="top">${brand}
      <div class="circle-pick">
        ${circles.length > 1
          ? `<select id="circle-switch" aria-label="Switch circle" data-keep="no">${circles.map(([id, c]) => `<option value="${esc(id)}" ${id === S.circleId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
          : `<b>${esc(S.circle.name)}</b>`}
        <span class="tag">${S.circle.type === 'family' ? 'Family' : 'Organisation'} · ${esc(plan().name)}</span>
      </div>
    </header>
    <main class="content">
      ${thisDeviceActive() ? '' : `<div class="warn strong"><b>Verth is set up on another device${me()?.device?.label ? ` (${esc(me().device.label)})` : ''}.</b> Answers and codes only work there. If you’ve switched phones, move Verth here. Everyone in your circle will be told you changed device.
        <button class="btn small" data-act="move-device">Use this device instead</button></div>`}
      ${waiting ? `<div class="banner accent"><span><b>${waiting} ${waiting > 1 ? 'people are' : 'person is'} waiting</b> for your approval to join.</span><button class="btn small" data-act="tab" data-tab="circle">Review</button></div>` : ''}
      ${body}
    </main>
    <nav class="tabs" aria-label="Sections">${TABS.map(([id, label, ic]) => `<button class="${S.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" aria-current="${S.tab === id ? 'page' : 'false'}">${ic}<span>${label}</span></button>`).join('')}</nav>
  </div>`);
}

function incomingCard(c) {
  const confirming = S.confirmYes === c.id, from = member(c.fromUid);
  return `<div class="incoming">
    <div class="eyebrow">Verth check · ${esc(c.channel)}</div>
    <div class="q">Did you ask ${esc(c.fromName)} to <b>${esc(c.summary)}</b>?</div>
    <p class="muted small">${esc(c.fromName)}${from?.title ? ` (${esc(from.title)})` : ''} received this request in your name and is waiting for your answer. <span data-countdown="${tsMs(c.expiresAt)}"></span></p>
    <p class="small warn-inline">Only say Yes if <b>you</b> made this request. If anyone is asking you to approve this on a call right now, it’s a scam. Say No.</p>
    ${!thisDeviceActive() ? '<p class="small"><b>Answer from your registered device.</b></p>'
      : confirming
        ? `<div class="confirm-yes"><p><b>Confirm: you asked ${esc(c.fromName)} to ${esc(c.summary)}.</b></p>
           <div class="row2"><button class="btn ghost" data-act="cancel-yes">Go back</button><button class="btn ok" data-act="answer" data-id="${esc(c.id)}" data-v="confirmed">Yes, I made this request</button></div></div>`
        : `<div class="row2"><button class="btn bad" data-act="answer" data-id="${esc(c.id)}" data-v="denied">No, not me</button>
           <button class="btn ghost" data-act="ask-yes" data-id="${esc(c.id)}">Yes, I asked…</button></div>`}
  </div>`;
}

function memberOptions(sel = '') {
  return others().map((m) => `<option value="${esc(m.uid)}" ${m.uid === sel ? 'selected' : ''}>${esc(m.name)}${m.title ? ' · ' + esc(m.title) : ''}${newDevice(m) ? ' · new device' : ''}</option>`).join('');
}

function codeCard() {
  const list = others();
  if (!list.length) return '<p class="muted">Codes appear once someone else is in your circle.</p>';
  if (!list.find((m) => m.uid === S.codeFor)) S.codeFor = list[0].uid;
  const who = member(S.codeFor);
  return `<label class="small">Show my code for<select id="code-for" data-keep="no">${memberOptions(S.codeFor)}</select></label>
    <div class="codecard"><div class="ring" data-ring></div>
    <div><div class="code" data-mycode>--- ---</div>
    <div class="muted small">Read this out if ${esc(who.name)} asks for your code. Each person gets a different code, and it changes every 30 seconds.</div></div></div>`;
}

function viewHome() {
  const mine = S.checks.filter((c) => c.toUid === S.user.uid && c.kind === 'push' && statusOf(c) === 'pending');
  const recent = S.checks.slice(0, 4);
  const used = monthChecks(), lim = plan().checksPerMonth;
  const stopped = S.checks.filter((c) => ['denied', 'code-mismatch'].includes(c.status)).length;
  return `
    ${heroBanner(esc, { name: me()?.name || S.profile?.name, place: S.circle.name, people: active().length, checks: used, stopped })}
    ${mine.map(incomingCard).join('')}
    ${'Notification' in window && Notification.permission === 'default' ? `<div class="banner"><span>Turn on alerts so you see checks while this tab is in the background.</span><button class="btn small" data-act="notify">Turn on</button></div>` : ''}
    ${others().length === 0 ? `<div class="banner accent"><span><b>Invite people to start.</b> A check needs the other person in your circle.</span><button class="btn small" data-act="tab" data-tab="circle">Invite</button></div>` : ''}
    ${quoteCarousel()}
    <div class="sec-hd plain"><span class="eyebrow">Quick actions</span><h2>What would you like to do?</h2></div>
    ${quickTiles([
      ['scan-kind', 'Check a message', 'SMS, WhatsApp or email', 'sms', 'data-kind="message"', 'violet'],
      ['scan-kind', 'Check a screenshot', 'Photo or QR code', 'camera', 'data-kind="image"', 'teal'],
      ['goverify', 'Ask on their phone', 'Is it really them?', 'ask', 'data-mode="push"', 'amber'],
      ['goverify', 'Check a caller’s code', 'For calls and video', 'code', 'data-mode="code"', 'red'],
    ])}
    <section class="card code-home"><div class="split"><h2>Your Verth code</h2>${lim !== Infinity ? `<span class="muted small">${used} of ${lim} free checks this month</span>` : ''}</div>${thisDeviceActive() ? codeCard() : '<p class="muted">Your code is shown on your registered device.</p>'}</section>
    ${alertShow()}
    ${stepsShow()}
    ${rulesGrid()}
    <section class="card"><div class="split"><h2>Recent checks</h2><button class="link" data-act="tab" data-tab="log">See all</button></div>
      ${recent.length ? `<ul class="list">${recent.map(logRow).join('')}</ul>` : '<p class="muted">No checks yet. They’ll appear here.</p>'}
      <button class="link" data-act="tab" data-tab="guide">How to use Verth</button></section>
    ${helplineBand()}
    ${signOff()}`;
}

function sentResult(sent) {
  const st = statusOf(sent), to = member(sent.toUid);
  if (st === 'pending') return `<div class="result wait"><div class="state-icon wait"><span class="spin"></span></div><h2>Asking ${esc(sent.toName)}…</h2><p>Sent to their registered device. Don’t act on the request yet. <span data-countdown="${tsMs(sent.expiresAt)}"></span></p>${deviceWarn(to)}</div>`;
  if (st === 'checking') return `<div class="result wait"><div class="state-icon wait"><span class="spin"></span></div><h2>Checking ${esc(sent.toName)}’s signature…</h2></div>`;
  if (st === 'confirmed') return `<div class="result ok"><div class="state-icon ok">${ICON.ok}</div><h2>Confirmed by ${esc(sent.toName)}</h2><p>Signed by their registered device ${fmtTime(sent.answeredAt)}. Go ahead through your normal approval process.</p>${deviceWarn(to)}<button class="btn ghost" data-act="newcheck">New check</button></div>`;
  if (st === 'unsigned') return `<div class="result bad"><div class="state-icon bad">${ICON.bad}</div><h2>Don’t trust this answer</h2><p>The “Yes” wasn’t signed by ${esc(sent.toName)}’s registered device. Someone may have their password. Don’t act, and contact ${esc(sent.toName)} in person.</p><button class="btn ghost" data-act="newcheck">New check</button></div>`;
  if (st === 'denied') return `<div class="result bad"><div class="state-icon bad">${ICON.bad}</div><h2>${esc(sent.toName)} didn’t send this</h2><p>Don’t pay, share or reply. Someone is pretending to be them.</p>
    ${sent.reported ? '<p><b>Reported to your circle.</b></p>' : `<button class="btn bad" data-act="report" data-id="${esc(sent.id)}">Report to my circle</button>`}<button class="btn ghost" data-act="newcheck">New check</button></div>`;
  return `<div class="result wait"><div class="state-icon wait">${ICON.wait}</div><h2>No answer from ${esc(sent.toName)}</h2><p>The check expired. Don’t act on the request until they confirm.</p><button class="btn ghost" data-act="newcheck">Try again</button></div>`;
}

function viewVerify() {
  if (!others().length) return `<section class="card"><h2>Invite someone first</h2><p class="muted">You can only check requests with approved people in your circle. Share your invite code, then approve them when they ask to join.</p><button class="btn primary" data-act="tab" data-tab="circle">Invite people</button></section>`;
  const sent = S.lastSentId && S.checks.find((c) => c.id === S.lastSentId);
  const seg = `<div class="seg" role="tablist"><button class="${S.verifyMode === 'push' ? 'on' : ''}" data-act="vmode" data-mode="push" role="tab">Ask on their phone</button><button class="${S.verifyMode === 'code' ? 'on' : ''}" data-act="vmode" data-mode="code" role="tab">Check a code</button></div>`;
  if (S.verifyMode === 'code') {
    const r = S.codeResult;
    return `${seg}<section class="card"><h2>Check their Verth code</h2>
      <p class="muted">On a call or video? Ask them to open Verth, choose <b>your</b> name under “Show my code for”, and read the code out. An impostor or deepfake can’t produce it.</p>
      ${thisDeviceActive() ? `<form data-form="code" class="stack" novalidate>
        <label>Who is the caller claiming to be?<select id="v-code-who" required>${memberOptions()}</select></label>
        <label>Code they read out<input id="v-code" inputmode="numeric" maxlength="7" placeholder="000 000" class="mono big" autocomplete="off"></label>
        <p class="err" id="v-err" role="alert"></p>
        <button class="btn primary" type="submit">Check code</button></form>` : '<p class="muted">Code checks work on your registered device.</p>'}</section>
      ${r ? `<div class="result ${r.ok ? 'ok' : 'bad'}"><div class="state-icon ${r.ok ? 'ok' : 'bad'}">${r.ok ? ICON.ok : ICON.bad}</div>
        <h2>${r.ok ? 'Code matches' : 'Code doesn’t match'}</h2>
        <p>${r.ok ? `The caller has ${esc(r.name)}’s registered device. Continue with your normal approval steps.` : `The person on the call doesn’t have ${esc(r.name)}’s device. Treat it as an impostor or deepfake. Don’t pay, share or change anything.`}</p>${r.ok ? deviceWarn(member(r.uid)) : ''}</div>` : ''}`;
  }
  if (sent && statusOf(sent) === 'pending') return seg + sentResult(sent);
  return `${seg}${sent ? sentResult(sent) : ''}<section class="card"><h2>Ask on their phone</h2>
    <form data-form="push" class="stack" novalidate>
      <label>Who does the request claim to be from?<select id="v-who" required>${memberOptions()}</select></label>
      <label>Where did it come from?<select id="v-channel">${CHANNELS.map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label>What are they asking you to do?<input id="v-what" maxlength="200" required placeholder="e.g. pay ₹80,000 to Sharma Traders today"></label>
      <p class="err" id="v-err" role="alert"></p>
      <button class="btn primary" type="submit">Send check</button>
      <p class="muted small">They get ${Math.round(CHECK_TTL_SECONDS / 60)} minutes to answer on their registered device. No answer means don’t act.</p></form></section>`;
}

function viewCircle() {
  const c = S.circle, lim = plan().maxMembers, admin = isAdmin();
  const pending = S.members.filter((m) => m.status === 'pending');
  const msg = `Join our Verth circle "${c.name}" so we can check payment requests, bank changes and emergency messages with each other. Open ${APP_URL} and enter code ${c.inviteCode.slice(0, 4)}-${c.inviteCode.slice(4)}`;
  const row = (m) => {
    const removable = admin && m.uid !== S.user.uid && m.role !== 'admin';
    return `<li><span class="avatar">${initials(m.name)}</span>
      <span class="grow"><b>${esc(m.name)}${m.uid === S.user.uid ? ' (you)' : ''}</b><span class="muted small">${esc(m.title || '')}${m.role === 'admin' ? ' · admin' : ''} · ${esc(m.email || '')}</span>
      ${newDevice(m) ? `<span class="small warn-inline">New device ${ago(tsMs(m.device.at))}</span>` : ''}</span>
      ${removable ? (S.confirmRemove === m.uid
        ? `<span class="row gap"><button class="btn small bad" data-act="remove" data-uid="${esc(m.uid)}">Remove</button><button class="btn small" data-act="cancel-remove">Keep</button></span>`
        : `<button class="btn small ghost" data-act="ask-remove" data-uid="${esc(m.uid)}">Remove</button>`) : ''}</li>`;
  };
  return `
  ${admin && pending.length ? `<section class="card attention"><h2>Waiting for your approval</h2>
    <p class="muted small">Only approve people you know. Check the email address, not just the name: a scammer can type any name.</p>
    <ul class="list people">${pending.map((m) => `<li><span class="avatar">${initials(m.name)}</span>
      <span class="grow"><b>${esc(m.name)}</b><span class="muted small">${esc(m.title || '')} · ${esc(m.email || '')} · asked ${fmtTime(m.joinedAt)}</span></span>
      <span class="row gap"><button class="btn small ok" data-act="approve" data-uid="${esc(m.uid)}">Approve</button><button class="btn small ghost" data-act="decline" data-uid="${esc(m.uid)}">Decline</button></span></li>`).join('')}</ul></section>` : ''}
  <section class="card"><h2>Invite people</h2>
    ${c.joinOpen === false
      ? `<p class="muted">Joining is turned off. Nobody can use an invite code until an admin turns it back on.</p>${admin ? '<button class="btn primary" data-act="join-open" data-v="1">Turn joining on</button>' : ''}`
      : `<p class="muted">${c.type === 'family' ? 'Share this code in your family WhatsApp group.' : 'Share this code with the people who request and approve payments or access.'} ${admin ? 'You approve everyone before they can see anything.' : 'An admin approves everyone who joins.'}</p>
    <div class="invite"><span class="mono">${fmtInvite(c.inviteCode)}</span><button class="btn small" data-act="copy" data-text="${esc(c.inviteCode)}">Copy code</button></div>
    <button class="btn ghost" data-act="copy" data-text="${esc(msg)}">Copy invite message</button>
    ${admin ? '<div class="row gap"><button class="btn small ghost" data-act="rotate-code">Change code</button><button class="btn small ghost" data-act="join-open" data-v="0">Turn joining off</button></div><p class="muted small">Change the code if it was shared somewhere public. The old code stops working immediately.</p>' : ''}`}
    <p class="muted small">${c.plan === 'team' ? `${c.memberCount || S.members.length} people on the Team plan, no limit.` : `${c.memberCount || S.members.length} of ${lim} places used on the ${esc(plan().name)} plan.`}</p></section>
  <section class="card"><h2>People in ${esc(c.name)}</h2><ul class="list people">${active().map(row).join('')}</ul></section>
  <section class="card"><h2>More circles</h2><p class="muted">Protect your workplace and your family separately.</p>
    <div class="row gap"><button class="btn ghost grow" data-act="setup" data-type="${c.type === 'family' ? 'org' : 'family'}">New ${c.type === 'family' ? 'organisation' : 'family'} circle</button><button class="btn ghost grow" data-act="setup" data-type="join">Join with a code</button></div>
    ${me().role !== 'admin' ? `${S.confirmRemove === 'leave' ? `<div class="row gap"><button class="btn small bad" data-act="leave">Leave ${esc(c.name)}</button><button class="btn small" data-act="cancel-remove">Stay</button></div>` : '<button class="link" data-act="ask-leave">Leave this circle</button>'}` : ''}</section>`;
}

function logRow(c) {
  const who = c.fromUid === S.user.uid ? `You checked with ${esc(c.toName)}` : `${esc(c.fromName)} checked with ${c.toUid === S.user.uid ? 'you' : esc(c.toName)}`;
  return `<li><span class="grow"><b>${who}</b><span class="muted small">${esc(c.kind === 'code' ? 'Code check' : c.summary)} · ${esc(c.channel || '')} · ${fmtTime(c.createdAt)}</span></span>${pill(c)}</li>`;
}

function viewLog() {
  const paid = S.circle.plan && S.circle.plan !== 'free';
  const stopped = S.checks.filter((c) => ['denied', 'code-mismatch'].includes(c.status)).length;
  return `<section class="card"><div class="stats"><div><b>${S.checks.length}</b><span>checks</span></div><div><b>${stopped}</b><span>stopped</span></div><div><b>${active().length}</b><span>people</span></div></div></section>
  <section class="card"><div class="split"><h2>Verification log</h2>${paid ? '<button class="btn small" data-act="csv">Export CSV</button>' : '<button class="btn small ghost" data-act="tab" data-tab="plan">Export (paid)</button>'}</div>
  <p class="muted small">Everyone in ${esc(S.circle.name)} can see this log. Entries can’t be edited or deleted, so there’s a lasting record of who approved what.</p>
  ${S.checks.length ? `<ul class="list">${S.checks.map(logRow).join('')}</ul>` : '<p class="muted">No checks yet.</p>'}</section>`;
}

function viewGuide() {
  const fam = S.circle.type === 'family';
  const org = `<section class="card"><h2>For organisations</h2><ul class="cases">
      <li><b>Accounts</b><span>A “director” on WhatsApp asks for an urgent transfer. Verify with the director before paying.</span></li>
      <li><b>HR and payroll</b><span>An employee emails asking to change their salary account. Verify with the employee.</span></li>
      <li><b>IT help desk</b><span>A caller wants a password or MFA reset. Ask for their Verth code.</span></li>
      <li><b>Vendor payments</b><span>A supplier sends “new bank details”. Verify with the colleague who owns that supplier.</span></li></ul>
    <h3>How your team joins</h3><ol class="how small-how">
      <li><b>Admin:</b> create an organisation circle (you did this if you see the Circle tab as admin).</li>
      <li><b>Admin:</b> in the Circle tab, tap <b>Copy invite message</b> and send it to your office WhatsApp group or by email.</li>
      <li><b>Each employee:</b> opens the link, signs in, taps <b>I have an invite code</b>, enters the code and their role (like “Accounts”).</li>
      <li><b>Admin:</b> approve each person in the Circle tab. Nobody gets in without your approval.</li>
      <li><b>Everyone:</b> agree one rule: <b>no Verth check, no payment</b> above an amount you choose.</li></ol></section>`;
  const home = `<section class="card"><h2>For families and households</h2><ul class="cases">
      <li><b>“New number” scams</b><span>“Hi Papa, this is my new number, send ₹20,000.” Verify with your son before paying.</span></li>
      <li><b>“Digital arrest” calls</b><span>A fake officer says a relative is in trouble. Check with that relative, or ask for their code.</span></li>
      <li><b>OTP requests</b><span>Someone asks your child or parent for an OTP “from the family”. Verify first.</span></li>
      <li><b>Deepfake video calls</b><span>A familiar face asks for money on a video call. Ask for their Verth code.</span></li></ul>
    <h3>Set it up at home</h3><ol class="how small-how"><li>Create a family circle.</li><li>Share the code in your family WhatsApp group, help elders join, and approve them.</li><li>Practise once together, so everyone knows what a check looks like.</li></ol></section>`;
  return `<section class="card"><h2>How to use Verth</h2><ol class="how">
      <li><b>Pause.</b> Urgency and secrecy are the scammer’s tools.</li>
      <li><b>Open Verify</b> and pick who the request claims to be from.</li>
      <li><b>Wait for their answer.</b> Only act on a green “Confirmed”.</li>
      <li><b>On live calls</b>, ask for their Verth code and check it.</li></ol></section>
    ${fam ? home + org : org + home}
    <section class="card"><h2>Stay safe</h2><ul class="plain">
      <li><b>Nobody legitimate will ever ask you to approve a Verth check for them.</b> If a caller says “just tap Yes”, it’s a scam.</li>
      <li>Verth never reads your WhatsApp, calls or email. You tell it what came in.</li>
      <li>A check goes only to the person’s own registered device, never to the number that contacted you.</li>
      <li>If someone’s device changed recently, Verth warns you. Confirm with them in person if you didn’t expect it.</li>
      <li>No answer in time means <b>don’t act</b>.</li>
      <li>Never share your Verth password or sign in on someone else’s phone.</li></ul>
    <button class="btn ghost" data-act="replay">Replay the welcome tour</button></section>`;
}

/* ---------- scam check ---------- */
const IST_MS = 19800000, DAY_MS = 86400000;
const todayKey = () => String(Math.floor((Date.now() + IST_MS) / DAY_MS));
const circlePaid = () => ['family', 'team'].includes(S.circle?.plan);
const photoLimit = () => ((S.profile?.plan && S.profile.plan !== 'free') || circlePaid() ? Infinity : PLANS.free.photoChecks);
const photoRef = () => doc(db, 'users', S.user.uid, 'meters', 'photos');
async function loadPhotoUsage() {
  try { const s = await getDoc(photoRef()); S.photoUsed = s.exists() ? s.data().count : 0; }
  catch { S.photoUsed = 0; }
}
// Counts a photo check before showing its result. The database refuses the 6th on the free plan.
async function usePhoto() {
  const ref = photoRef();
  if (!S.photoUsed) {
    try { await setDoc(ref, { count: 1, at: serverTimestamp() }); S.photoUsed = 1; return; }
    catch (e) { const s = await getDoc(ref).catch(() => null); if (!s?.exists()) throw e; S.photoUsed = s.data().count; }
  }
  await updateDoc(ref, { count: increment(1), at: serverTimestamp(), ...(circlePaid() && S.profile?.plan === 'free' ? { via: S.circleId } : {}) });
  S.photoUsed += 1;
}
const scanLimit = () => ((S.profile?.plan && S.profile.plan !== 'free') || circlePaid() ? Infinity : PLANS.free.scansPerDay);
async function loadUsage() {
  try { const s = await getDoc(doc(db, 'users', S.user.uid, 'usage', todayKey())); S.scanUsed = s.exists() ? s.data().scans : 0; }
  catch { S.scanUsed = 0; }
}
// Counts a scan before showing its result. The database refuses the third free scan of the day.
async function useScan() {
  const ref = doc(db, 'users', S.user.uid, 'usage', todayKey());
  if (!S.scanUsed) {
    try { await setDoc(ref, { scans: 1, at: serverTimestamp() }); S.scanUsed = 1; return; }
    catch (e) { const s = await getDoc(ref).catch(() => null); if (!s?.exists()) throw e; S.scanUsed = s.data().scans; }
  }
  // Members of a Family or Team circle name it, so the database can see they're covered.
  await updateDoc(ref, { scans: increment(1), at: serverTimestamp(), ...(circlePaid() && S.profile?.plan === 'free' ? { via: S.circleId } : {}) });
  S.scanUsed += 1;
}
async function loadReportCount(r) {
  if (!r?.fp) return;
  try {
    const [n, mine] = await Promise.all([getCountFromServer(collection(db, 'reports', r.fp, 'by')), getDoc(doc(db, 'reports', r.fp, 'by', S.user.uid))]);
    S.reports[r.fp] = n.data().count;
    if (mine.exists()) S.myReports.add(r.fp);
  } catch {}
  renderScanView();
}
const renderScanView = () => (S.scanOnly || !S.circle ? renderScanOnly() : renderMain());

const VERDICT = {
  danger: ['bad', 'High risk: this looks like a scam'],
  caution: ['wait', 'Be careful: there are warning signs'],
  clear: ['ok', 'No obvious red flags'],
};
function scanResultCard(r) {
  const [cls, head] = VERDICT[r.verdict], flags = [...r.flags].sort((a, b) => b.level - a.level);
  const n = S.reports[r.fp] || 0, mine = S.myReports.has(r.fp);
  const what = { link: 'link', phone: 'number', message: 'message', job: 'offer', image: 'message' }[r.kind];
  const isJob = r.kind === 'job' || r.sub === 'job';
  const qr = r.qr;
  return `<div class="result verdict ${cls}" id="scan-result">
    <div class="split"><div class="state-icon ${cls}">${cls === 'ok' ? ICON.ok : cls === 'bad' ? ICON.bad : ICON.wait}</div>
      <div class="meter" aria-label="Risk ${Math.min(10, r.score)} out of 10"><span style="width:${Math.min(100, 8 + r.score * 11)}%"></span></div></div>
    <h2>${head}</h2>
    ${r.kind === 'phone' && r.normalized ? `<p class="mono">${esc(r.normalized)}</p>` : r.kind === 'link' && r.host ? `<p class="mono">${esc(r.host)}</p>` : ''}
    ${flags.length ? `<ul class="flags">${flags.map((f) => `<li class="lv${f.level}"><b>${esc(f.title)}</b><span>${esc(f.why)}</span></li>`).join('')}</ul>` : ''}
    ${r.good.length ? `<ul class="goods">${r.good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    ${r.links?.length ? `<div class="found"><b>Links found</b>${r.links.map((l) => `<div class="split small"><span class="mono">${esc(l.host || l.normalized)}</span><span class="pill ${VERDICT[l.verdict][0]}">${l.verdict === 'danger' ? 'High risk' : l.verdict === 'caution' ? 'Careful' : 'No flags'}</span></div>`).join('')}</div>` : ''}
    <div class="community">${n ? `<b>Reported as a scam by ${n} Verth ${n === 1 ? 'user' : 'users'}.</b>` : 'No Verth user has reported this yet.'}
      ${mine ? '<span class="pill bad">You reported this</span>' : `<button class="btn small" data-act="report-scam">Report this ${what} as a scam</button>`}</div>
    ${r.kind === 'image' ? `<div class="found"><b>What Verth found in your picture</b>
      ${qr?.type === 'upi' ? `<span>A UPI QR code that pays ${qr.amount ? esc(qr.amount) + ' to ' : ''}<b>${esc(qr.name || qr.payee)}</b>${qr.name && qr.payee ? ` (${esc(qr.payee)})` : ''}.</span>` : qr?.type === 'link' ? `<span>A QR code that opens <span class="mono">${esc(qr.host)}</span>.</span>` : qr ? '<span>A QR code with some text in it.</span>' : ''}
      ${r.text ? `<details><summary>Show the words Verth read</summary><p class="ocr-text">${esc(r.text)}</p></details>` : ''}</div>` : ''}
    ${isJob && r.company ? `<div class="company"><b>${esc(r.company.name)}: the only real email addresses</b><span class="mono">${r.company.domains.map((d) => '@' + esc(d)).join('  ')}</span><span class="small">Apply and verify offers only through the Careers page on <b>${esc(r.company.site)}</b>. Type the address yourself; don’t use links in the message.</span></div>` : ''}
    ${isJob && !r.company ? '<div class="company"><b>Check the company yourself</b><span class="small">Search for the company’s official website, open its Careers page, and confirm the job exists there. Their recruitment emails should come from that same website’s domain, never Gmail or Yahoo.</span></div>' : ''}
    <div class="advice"><b>What to do</b><ul>${(isJob ? [...JOB_ADVICE, ...ADVICE[r.verdict].slice(r.verdict === 'clear' ? 0 : 1)] : ADVICE[r.verdict]).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      <p class="small">Report fraud calls and messages at <a href="https://sancharsaathi.gov.in/sfc/" target="_blank" rel="noopener noreferrer">Sanchar Saathi (Chakshu)</a>. Lost money? Call <b>1930</b> or report at <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a> immediately.</p></div>
    ${S.circle && r.verdict !== 'clear' ? '<button class="btn primary" data-act="goverify" data-mode="push">Ask the real person on Verth</button>' : ''}
    <button class="btn ghost" data-act="scan-again">Check something else</button>
  </div>`;
}
const KINDS = [
  ['image', 'Photo or screenshot', 'camera'], ['message', 'Message or email', 'chat'], ['job', 'Job or exam offer', 'job'],
  ['link', 'Link', 'link'], ['phone', 'Phone number', 'phone'],
];
function photoField() {
  if (S.photo) {
    return `<div class="photo-pick"><img src="${esc(S.photoUrl)}" alt="The picture you chose">
      <div class="stack">${S.photoShared ? '<b>Shared to Verth</b>' : '<b>Your picture</b>'}<span class="muted small">Tap <b>Check it</b> and Verth will read the words and any QR code in it.</span>
      ${S.photoBusy ? '' : '<button type="button" class="link" data-act="photo-clear">Choose a different picture</button>'}</div></div>`;
  }
  return `<label class="drop" for="s-image">${ICON.camera}<b>Tap here to add a screenshot or photo</b>
      <span>Take a photo of the message, or choose a screenshot from your gallery.</span></label>`;
}
function viewScan() {
  const k = S.scanKind, r = S.scanResult, img = k === 'image';
  const lim = img ? photoLimit() : scanLimit(), used = (img ? S.photoUsed : S.scanUsed) ?? 0, left = lim === Infinity ? Infinity : Math.max(0, lim - used);
  const tiles = `<div class="kinds" role="tablist" aria-label="What do you want to check?">${KINDS.map(([id, t, ic]) => `<button type="button" class="kind ${k === id ? 'on' : ''}" data-act="scan-kind" data-kind="${id}" role="tab" aria-selected="${k === id}">${ICON[ic]}<span>${t}</span></button>`).join('')}
    <button type="button" class="kind help" data-act="open-helper">${ICON.help}<span>Not sure? Ask for help</span></button></div>`;
  const pre = S.prefill && S.prefill.kind === k ? esc(S.prefill.text) : '';
  const field = img
    ? `${photoField()}<input id="s-image" class="sr-file" type="file" accept="image/*" data-keep="no" aria-label="Choose a screenshot or photo">
       ${S.photoBusy ? `<div class="ocr-prog" role="status"><span id="ocr-stage">${esc(S.photoBusy.stage)}</span><div class="bar"><i id="ocr-bar" style="width:${S.photoBusy.pct}%"></i></div></div>` : ''}`
    : k === 'message'
    ? `<label>Paste the SMS, WhatsApp message or email<textarea id="s-message" rows="6" maxlength="5000" placeholder="e.g. Dear customer, your account will be blocked today. Update KYC: http://…">${pre}</textarea></label>`
    : k === 'job' ? `<label>Paste the job, exam or interview email or message<span class="muted small">Include the “From:” line and any links if you can. That’s where fakes give themselves away.</span><textarea id="s-job" rows="7" maxlength="6000" placeholder="e.g. From: TCS Recruitment &lt;hr.tcs@gmail.com&gt; – You are shortlisted for the online exam. Pay ₹1,500 to confirm your slot…">${pre}</textarea></label>
      <label>Which company does it claim to be from? <span class="muted small">(optional)</span><input id="s-company" list="company-list" maxlength="60" autocomplete="off" placeholder="e.g. TCS, Infosys, Wipro"></label>
      <datalist id="company-list">${Object.keys(COMPANIES).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`
    : k === 'link' ? `<label>Paste the link<input id="s-link" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2000" placeholder="e.g. sbi-kyc-update.xyz/login" value="${pre}"></label>`
      : `<label>Enter the phone number that called or messaged you<input id="s-phone" inputmode="tel" autocomplete="off" maxlength="25" placeholder="e.g. +91 98765 43210" value="${pre}"></label>`;
  const counter = lim === Infinity ? `<span class="pill ok">Unlimited${img ? ' photo checks' : ''}</span>` : `<span class="muted small">${left} of ${lim} free ${img ? 'photo checks left' : 'checks left today'}</span>`;
  const limitCard = img
    ? `<section class="card attention"><h2>You’ve used your ${lim} free photo checks</h2>
      <p class="muted">Photo and screenshot checks are unlimited on every paid plan, from ₹149 a month. You can still type or paste the message and check it free.</p>
      <div class="row gap"><button class="btn primary" data-act="${S.scanOnly || !S.circle ? 'upgrade' : 'tab'}" data-plan="personal" data-tab="plan">See plans</button><button class="btn ghost" data-act="scan-kind" data-kind="message">Type the message instead</button></div></section>`
    : `<section class="card attention"><h2>You’ve used today’s free checks</h2>
      <p class="muted">Free accounts get ${lim} scam checks a day. They reset at midnight (India time). Upgrade for unlimited checks for you, or your whole family.</p>
      <button class="btn primary" data-act="${S.scanOnly || !S.circle ? 'upgrade' : 'tab'}" data-plan="personal" data-tab="plan">See plans</button></section>`;
  const banner = S.prefill ? `<div class="banner accent"><span><b>${S.prefill.from === 'helper' ? 'From Verth Helper.' : 'Shared to Verth.'}</b> Check it below before you reply, click or pay.</span></div>` : '';
  return `${banner}<section class="card"><div class="split"><h2>Scam check</h2>${counter}</div>
      <p class="muted">What do you want to check? Tap one.</p>
      ${tiles}
      ${left === 0 && !r ? '' : `<form data-form="scan" class="stack" novalidate>${field}<p class="err" id="scan-err" role="alert"></p><button class="btn primary big" type="submit" ${S.photoBusy ? 'disabled' : ''}>${S.photoBusy ? '<span class="spin" aria-hidden="true"></span> Reading your picture…' : 'Check it'}</button></form>`}
      <p class="muted small">${img ? 'Your picture stays on your phone. Verth reads it here and never uploads it.' : 'Checks run on your device. Verth doesn’t store what you paste.'} If you report something, only a scrambled fingerprint of it is saved.</p></section>
    ${left === 0 && !r ? limitCard : ''}
    ${r ? scanResultCard(r) : ''}`;
}

/* ---------- photo and screenshot checks ---------- */
const OCR_MODULE = './ocr/imagecheck.js'; // loaded only when a picture is checked
function setPhoto(file, shared = false) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('That file isn’t a picture. Choose a screenshot or photo.', 'bad'); return; }
  if (S.photoUrl) URL.revokeObjectURL(S.photoUrl);
  Object.assign(S, { photo: file, photoUrl: URL.createObjectURL(file), photoShared: shared, scanKind: 'image', scanResult: null, prefill: null });
  if (S.circle && !S.scanOnly) S.tab = 'scan';
  renderScanView();
}
function clearPhoto() {
  if (S.photoUrl) URL.revokeObjectURL(S.photoUrl);
  Object.assign(S, { photo: null, photoUrl: '', photoShared: false });
}
async function scanPhoto(f) {
  if (!S.photo) return setErr('scan-err', 'Add a screenshot or photo first. Tap the box above.');
  if (photoLimit() !== Infinity && (S.photoUsed ?? 0) >= photoLimit()) { S.scanResult = null; return renderScanView(); }
  const fail = (msg) => { S.photoBusy = null; renderScanView(); setErr('scan-err', msg); };
  S.photoBusy = { stage: 'Opening your picture', pct: 3 }; renderScanView();
  let read;
  try {
    const mod = await import(OCR_MODULE);
    read = await mod.readImage(S.photo, (stage, pct) => {
      S.photoBusy = { stage, pct };
      const a = document.getElementById('ocr-stage'), b = document.getElementById('ocr-bar');
      if (a) a.textContent = stage;
      if (b) b.style.width = pct + '%';
    });
  } catch (e) {
    return fail(e?.message === 'too-big' ? 'That picture is too large. Try a screenshot instead.'
      : e?.message === 'not-image' ? 'That file isn’t a picture. Choose a screenshot or photo.'
        : 'Couldn’t read the picture. Check your internet connection (the reader downloads once), then try again.');
  }
  const r = checkImage(read.text, read.qr);
  if (r.unreadable) return fail('Verth couldn’t find any words or a QR code in this picture. Try a clearer screenshot, or type the message instead. This didn’t use up a free check.');
  try { await usePhoto(); }
  catch (e) {
    if (e?.code === 'permission-denied') { S.photoBusy = null; S.photoUsed = photoLimit(); S.scanResult = null; return renderScanView(); }
    return fail(friendlyError(e));
  }
  r.fp = r.normalized ? await fingerprint(r.fpKind, r.normalized) : null;
  S.photoBusy = null; S.scanResult = r;
  renderScanView();
  document.getElementById('scan-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadReportCount(r);
}

function renderScanOnly() {
  S.scanOnly = true; stopListeners(); S.circle = null; S.circleId = null;
  const interest = S.profile?.upgradeInterest?.plan;
  paint(`<div class="app">
    <header class="top">${brand}<div class="circle-pick"><b>Scam check</b><span class="tag">${esc(S.user.email)}</span></div></header>
    <main class="content">
      ${heroBanner(esc, { name: S.profile?.name || S.user.displayName, scanOnly: true })}
      ${S.pending.length ? `<div class="banner"><span>Waiting for approval to join ${S.pending.map((p) => esc(p.name)).join(', ')}.</span></div>` : ''}
      ${viewScan()}
      ${quoteCarousel()}
      ${alertShow()}
      <section class="card"><h2>Protect your family or team</h2><p class="muted">Set up a circle to check requests with the real person, on their own phone, before anyone pays or shares anything.</p>
        <div class="row gap"><button class="btn ghost grow" data-act="setup" data-type="family">Family circle</button><button class="btn ghost grow" data-act="setup" data-type="org">Organisation</button></div>
        <button class="link" data-act="setup" data-type="join">I have an invite code</button></section>
      ${S.profile?.plan === 'personal' ? billingCard(S.profile.billing, 'user') : `<section class="card"><h2>Unlimited scam and photo checks</h2><p class="muted">Personal plan, ₹149 a month.${PAY_API ? ' Pay with UPI or card through Razorpay. Cancel any time.' : ' Paid plans open with online payment soon; you won’t be charged now.'}</p>
        ${PAY_API ? payButton('personal', 'Get Personal · ₹149 / month') : interest === 'personal' ? '<span class="pill wait">We’ll notify you</span>' : '<button class="btn primary" data-act="upgrade" data-plan="personal">Notify me when it opens</button>'}</section>`}
      ${rulesGrid()}
      ${helplineBand()}
      <div class="links"><button class="link" data-act="replay">Replay the welcome tour</button><button class="link" data-act="signout">Sign out</button></div>
      ${signOff()}
    </main></div>`);
}

// Billing details shown to the person who pays (and, for circles, to everyone in it).
const fmtDate = (t) => new Date(typeof t === 'string' ? Date.parse(t) : tsMs(t)).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
function billingCard(b, target) {
  if (!b) return '';
  const canCancel = PAY_API && !b.cancelAtEnd && ['active', 'authenticated', 'pending'].includes(b.status) && (target === 'user' || isAdmin());
  const when = b.currentEnd ? fmtDate(b.currentEnd) : '';
  const line = b.status === 'pending' ? '<span class="pill wait">Payment retrying</span> Razorpay will try your payment again. Check your UPI app or card.'
    : b.cancelAtEnd ? `<span class="pill wait">Renewal cancelled</span> Your plan stays on until ${esc(when)}.`
    : `<span class="pill ok">Active</span> ${when ? `Renews on ${esc(when)}.` : ''}`;
  const sure = S.confirmCancel === target;
  return `<section class="card"><h2>Subscription</h2>
    <p>${line}</p>
    <p class="muted small">Payments are handled by Razorpay. <a href="refunds.html" target="_blank" rel="noopener">Cancellation and refunds</a></p>
    ${canCancel ? (sure
      ? `<div class="warn">Stop renewing? You keep the plan until ${esc(when || 'the end of this month')}, then it goes back to Free.</div><div class="row gap"><button class="btn bad grow" data-act="cancel-sub" data-target="${target}" ${S.payBusy ? 'disabled' : ''}>Yes, stop renewing</button><button class="btn ghost grow" data-act="cancel-sub-no">Keep it</button></div>`
      : `<button class="btn ghost" data-act="cancel-sub-ask" data-target="${target}">Cancel subscription</button>`) : ''}</section>`;
}
const payButton = (id, label) => `<button class="btn primary" data-act="upgrade" data-plan="${id}" ${S.payBusy ? 'disabled' : ''}>${S.payBusy === id ? '<span class="spin" aria-hidden="true"></span> Opening Razorpay…' : esc(label)}</button>`;

function viewPlan() {
  const personal = S.profile?.plan === 'personal', cp = S.circle.plan || 'free', used = monthChecks();
  const interest = S.profile?.upgradeInterest?.plan, admin = isAdmin(), live = !!PAY_API;
  const count = S.circle.memberCount || S.members.length;
  const action = (id) => {
    if (id === 'free') return '';
    if (id === 'personal' ? personal : cp === id) return '<span class="pill ok">Current plan</span>';
    if (!live) return interest === id ? '<span class="pill wait">We’ll notify you</span>' : `<button class="btn primary" data-act="upgrade" data-plan="${id}">Choose ${PLANS[id].name}</button>`;
    if (id === 'personal') return circlePaid() ? '<span class="muted small">Already included in your circle’s plan.</span>' : payButton('personal', 'Subscribe');
    if (circlePaid()) return '';
    if (!admin) return '<span class="muted small">Ask an admin of this circle to choose it.</span>';
    if (id === 'family' && count > 10) return '<span class="muted small">Your circle has more than 10 people. Choose Team.</span>';
    return payButton(id, 'Subscribe');
  };
  const LOOK = { free: ['gift', 'To try Verth'], personal: ['user', 'Just for you'], family: ['people', 'For your family · up to 10'], team: ['building', 'Whole organisation · no limits'] };
  const card = (id, title, price, items) => `<div class="plan p-${id} ${(id === 'personal' ? personal : cp === id && !(id === 'free' && personal)) ? 'current' : ''}">${id === 'team' ? '<span class="flag">Everything unlimited</span>' : ''}<div class="plan-hd"><span class="plan-ic">${ICON[LOOK[id][0]]}</span><div><h3>${title}</h3><span class="who">${LOOK[id][1]}</span></div></div><div class="price">${price}</div><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>${action(id)}</div>`;
  return `<section class="card"><h2>Your plan</h2><p><b>${esc(plan().name)}</b> for ${esc(S.circle.name)}${personal ? ', plus <b>Personal</b> for you' : ''}.
      ${plan().checksPerMonth === Infinity ? 'Unlimited checks.' : `${used} of ${plan().checksPerMonth} checks used this month.`} ${cp === 'team' ? `${count} people, no limit.` : `${count} of ${plan().maxMembers} places used.`}</p></section>
    ${circlePaid() && S.circle.billing ? billingCard(S.circle.billing, 'circle') : ''}
    ${personal && S.profile.billing ? billingCard(S.profile.billing, 'user') : ''}
    <section class="card"><h2>Scam checks</h2><p>${scanLimit() === Infinity ? 'Unlimited scam checks.' : `${Math.min(S.scanUsed ?? 0, scanLimit())} of ${scanLimit()} free scam checks used today. They reset at midnight (India time).`}</p>
      <p>${photoLimit() === Infinity ? 'Unlimited photo and screenshot checks.' : `${Math.min(S.photoUsed ?? 0, photoLimit())} of ${photoLimit()} free photo checks used. Paid plans make them unlimited.`}</p></section>
    <div class="plans">
      ${card('free', 'Free', '₹0', ['Up to 5 people', '20 verification checks a month', '2 scam checks a day', '5 free photo checks', 'Signed push checks and rolling codes'])}
      ${card('personal', 'Personal', '₹149 <small>/ month</small>', ['Unlimited scam checks for you', 'Unlimited photo and screenshot checks', 'Messages, emails, jobs, links and numbers', 'Everything in Free'])}
      ${card('family', 'Family', '₹199 <small>/ month</small>', ['Up to 10 people', 'Unlimited checks', 'Unlimited scam and photo checks for everyone', 'Log export'])}
      ${card('team', 'Team', '₹299 <small>/ month</small>', ['Your whole organisation: no limit on people', 'Unlimited checks, scam and photo checks', 'Log export for auditors', 'Admin controls and priority support', 'Everything in every plan'])}
    </div>
    <p class="muted small">${live ? 'Pay monthly with UPI Autopay or a card, through Razorpay. Verth never sees your card or UPI PIN. Cancel any time and keep the plan until the end of the month you paid for. <a href="terms.html" target="_blank" rel="noopener">Terms</a> · <a href="refunds.html" target="_blank" rel="noopener">Refunds</a>' : 'Paid plans open with online payment shortly. Choose one to be notified first; you won’t be charged now.'}</p>
    <section class="card"><h2>Account and device</h2><p class="muted">${esc(S.user.email)}</p>
      <p class="muted small">This device: ${esc(deviceLabel())}${thisDeviceActive() ? ' · registered' : ' · not registered'}</p>
      <button class="btn ghost" data-act="signout">Sign out</button></section>`;
}

/* ---------- payments (Razorpay, through the Verth payments worker) ---------- */
async function payApi(path, body) {
  const token = await S.user.getIdToken();
  let r;
  try {
    r = await fetch(PAY_API.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  } catch { throw new Error('Couldn’t reach the payment service. Check your connection.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'The payment service had a problem. Try again in a minute.');
  return j;
}
let checkoutLoading = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return (checkoutLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => { checkoutLoading = null; s.remove(); reject(new Error('Couldn’t load Razorpay. Check your connection.')); };
    document.head.appendChild(s);
  }));
}
async function refreshProfile() {
  const s = await getDoc(doc(db, 'users', S.user.uid));
  if (s.exists()) S.profile = s.data();
}
async function startCheckout(planId) {
  S.payBusy = planId; renderScanView();
  try {
    const [sub] = await Promise.all([payApi('/subscribe', { plan: planId, circleId: S.circleId || null }), loadCheckout()]);
    const result = await new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: sub.keyId, subscription_id: sub.subscriptionId, name: 'Verth', description: sub.description,
        prefill: { name: S.profile?.name || S.user.displayName || '', email: S.user.email || '' },
        notes: { plan: planId }, theme: { color: '#FFB224' },
        handler: (resp) => payApi('/verify', resp).then(resolve, reject),
        modal: { ondismiss: () => reject(new Error('dismissed')), confirm_close: true },
      });
      rzp.open();
    });
    await refreshProfile();
    if (result.paid) toast(`Payment received. ${PLANS[planId].name} is now active.`, 'ok');
    else {
      toast('Payment is being confirmed. Your plan switches on within a few minutes.');
      // Razorpay's webhook usually lands within seconds; look again a few times.
      for (const ms of [4000, 8000, 15000]) setTimeout(() => refreshProfile().then(renderScanView).catch(() => {}), ms);
    }
  } catch (e) {
    if (e.message !== 'dismissed') toast(e.message, 'bad');
  } finally { S.payBusy = null; renderScanView(); }
}

/* ---------- signatures ---------- */
async function verifySigs() {
  let changed = false;
  for (const c of S.checks) {
    if (c.status !== 'confirmed' || S.sig.has(c.id)) continue;
    const signer = member(c.toUid);
    let ok = false;
    if (signer?.device?.sig && c.sig && c.sigN === signer.device.n) {
      ok = await verifyAnswer(signer.device.sig, answerPayload(S.circleId, { ...c, expiresMs: tsMs(c.expiresAt) }, 'confirmed'), c.sig);
    }
    S.sig.set(c.id, ok); changed = true;
  }
  if (changed) renderMain();
}

/* ---------- live data ---------- */
function stopListeners() { S.unsubs.forEach((u) => u()); S.unsubs = []; }

async function openCircle(cid) {
  stopListeners();
  Object.assign(S, { circleId: cid, circle: S.circles[cid] || null, members: [], checks: [], lastSentId: null, codeResult: null, confirmYes: null, confirmRemove: null });
  S.sig = new Map();
  let first = true;
  S.unsubs.push(onSnapshot(doc(db, 'circles', cid), (s) => {
    if (!s.exists()) return;
    S.circle = { id: s.id, ...s.data() }; S.circles[cid] = S.circle; renderMain();
  }, () => afterSignIn()));
  S.unsubs.push(onSnapshot(collection(db, 'circles', cid, 'members'), (s) => {
    S.members = s.docs.map((d) => d.data()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (!me()) { toast('You’re no longer in that circle.'); afterSignIn(); return; }
    S.sig = new Map(); // re-verify if anyone's device changed
    renderMain(); verifySigs();
  }, () => {}));
  S.unsubs.push(onSnapshot(query(collection(db, 'circles', cid, 'checks'), orderBy('createdAt', 'desc'), limit(100)), (s) => {
    S.checks = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const c of S.checks) {
      if (!S.seen.has(c.id)) {
        S.seen.add(c.id);
        if (!first && c.toUid === S.user.uid && c.kind === 'push' && statusOf(c) === 'pending') alertIncoming(c);
      }
    }
    first = false;
    renderMain(); verifySigs();
  }, () => {}));
  if (S.profile.activeCircle !== cid) updateDoc(doc(db, 'users', S.user.uid), { activeCircle: cid }).catch(() => {});
}

function alertIncoming(c) {
  S.tab = 'home';
  toast(`${c.fromName} is checking a request in your name`, 'accent');
  try { navigator.vibrate?.([180, 80, 180]); } catch {}
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification('Verth check', { body: `Did you ask ${c.fromName} to ${c.summary}?`, tag: c.id }); } catch {}
  }
}

// Sort the user's circles into active ones and ones still waiting for approval.
async function loadCircles() {
  S.circles = {}; S.pending = [];
  await Promise.all((S.profile.circles || []).map(async (id) => {
    try {
      const m = await getDoc(doc(db, 'circles', id, 'members', S.user.uid));
      if (!m.exists()) return;
      if (m.data().status === 'active') {
        const s = await getDoc(doc(db, 'circles', id));
        if (s.exists()) S.circles[id] = { id, ...s.data() };
      } else {
        let name = 'a circle';
        try { const inv = await getDoc(doc(db, 'invites', m.data().inviteCode)); if (inv.exists()) name = inv.data().circleName; } catch {}
        S.pending.push({ id, name });
      }
    } catch {}
  }));
}

let pendingWatch = [];
function watchPending() {
  pendingWatch.forEach((u) => u()); pendingWatch = [];
  for (const p of S.pending) {
    pendingWatch.push(onSnapshot(doc(db, 'circles', p.id, 'members', S.user.uid), (s) => {
      if (!s.exists()) { toast(`Your request to join ${p.name} was declined.`); afterSignIn(); }
      else if (s.data().status === 'active') { toast(`You’ve been approved to join ${p.name}`, 'ok'); afterSignIn(p.id); }
    }, () => {}));
  }
}

async function afterSignIn(preferId) {
  const u = S.user;
  const ref = doc(db, 'users', u.uid);
  let s = await getDoc(ref);
  if (!s.exists()) {
    if (!u.displayName) return renderName();
    const name = u.displayName.slice(0, 60);
    await setDoc(ref, { name, email: u.email, plan: 'free', circles: [], activeCircle: null, onboarded: false, createdAt: serverTimestamp() });
    s = await getDoc(ref);
  }
  S.profile = s.data();
  S.keys = await deviceKeys(u.uid);
  await Promise.all([loadCircles(), loadUsage(), loadPhotoUsage()]);
  watchPending();
  const ids = Object.keys(S.circles);
  const wantScan = takeShared();
  if (wantScan) S.tab = 'scan';
  if (!ids.length) {
    if (wantScan) return renderScanOnly();
    if (S.pending.length) return renderPending();
    if (S.profile.onboarded) return renderScanOnly();
    S.tourStep = 0;
    return renderTour();
  }
  const pick = ids.includes(preferId) ? preferId : ids.includes(S.profile.activeCircle) ? S.profile.activeCircle : ids[0];
  await openCircle(pick);
}

const newDeviceRecord = (n) => ({ dh: S.keys.pub.dh, sig: S.keys.pub.sig, n, at: serverTimestamp(), label: deviceLabel() });

/* ---------- actions ---------- */
// A check is saved together with the sender's anti-flood meter (one check every 5 seconds).
async function logCheck(ref, data) {
  const b = writeBatch(db);
  b.set(ref, data);
  b.set(doc(db, 'users', S.user.uid, 'meters', 'checks'), { at: serverTimestamp() });
  try { await b.commit(); }
  catch (e) { if (e?.code === 'permission-denied') throw Object.assign(new Error('slow'), { code: 'verth/slow-down' }); throw e; }
}
const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
const busy = (form, on) => form?.querySelectorAll('button').forEach((b) => (b.disabled = on));

const actions = {
  reload: () => location.reload(),
  'otp-change': () => { S.otpEmail = ''; renderAuth(); },
  'otp-resend': async () => {
    try { await sendCode(S.otpEmail); renderCode('We sent a new code. Use the newest email.'); }
    catch (e) { setErr('a-err', friendlyError(e)); }
  },
  google: async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { setErr('a-err', friendlyError(e)); }
  },
  signout: async () => { stopListeners(); pendingWatch.forEach((u) => u()); pendingWatch = []; S.seen.clear(); await signOut(auth); },
  'tour-next': () => { S.tourStep++; renderTour(); },
  'tour-back': () => { S.tourStep--; renderTour(); },
  'tour-skip': () => { S.tourStep = TOUR.length - 1; renderTour(); },
  'tour-choose': (el) => {
    if (!S.profile.onboarded) { S.profile.onboarded = true; updateDoc(doc(db, 'users', S.user.uid), { onboarded: true }).catch(() => {}); }
    if (el.dataset.type === 'scan') { if (Object.keys(S.circles).length) { S.tab = 'scan'; return afterSignIn(S.circleId); } return renderScanOnly(); }
    renderSetup(el.dataset.type);
  },
  'scan-only': () => renderScanOnly(),
  'scan-kind': (el) => {
    S.scanKind = el.dataset.kind; S.scanResult = null;
    const jump = S.circle && S.tab !== 'scan';
    if (jump) S.tab = 'scan';
    renderScanView();
    if (jump) window.scrollTo(0, 0); else document.querySelector('.kinds')?.scrollIntoView({ block: S.scanOnly ? 'start' : 'nearest', behavior: 'smooth' });
  },
  'scan-again': () => { S.scanResult = null; clearPhoto(); renderScanView(); window.scrollTo(0, 0); },
  'photo-clear': () => { clearPhoto(); S.scanResult = null; renderScanView(); },
  'open-helper': () => helper?.open(),
  'report-scam': async () => {
    const r = S.scanResult; if (!r?.fp) return;
    try {
      await setDoc(doc(db, 'reports', r.fp, 'by', S.user.uid), { kind: r.kind === 'job' || r.kind === 'image' ? 'message' : r.kind, at: serverTimestamp() });
      S.myReports.add(r.fp); S.reports[r.fp] = (S.reports[r.fp] || 0) + 1;
      toast('Thanks. Your report helps warn other Verth users.', 'ok'); renderScanView();
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'setup-back': () => (S.circle ? renderMain() : S.pending.length ? renderPending() : S.profile?.onboarded ? renderScanOnly() : (S.tourStep = TOUR.length - 1, renderTour())),
  setup: (el) => renderSetup(el.dataset.type),
  replay: () => { S.tourStep = 0; renderTour(); },
  tab: (el) => { S.tab = el.dataset.tab; S.confirmRemove = null; renderMain(); window.scrollTo(0, 0); },
  goverify: (el) => { S.tab = 'verify'; S.verifyMode = el.dataset.mode; S.codeResult = null; renderMain(); },
  vmode: (el) => { S.verifyMode = el.dataset.mode; S.codeResult = null; renderMain(); },
  newcheck: () => { S.lastSentId = null; renderMain(); },
  notify: async () => { try { await Notification.requestPermission(); } catch {} renderMain(); },
  copy: async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied'); }
    catch { toast('Couldn’t copy automatically. Select the text and copy it.'); }
  },
  'ask-yes': (el) => { S.confirmYes = el.dataset.id; renderMain(); },
  'cancel-yes': () => { S.confirmYes = null; renderMain(); },
  answer: async (el) => {
    const c = S.checks.find((x) => x.id === el.dataset.id), v = el.dataset.v;
    if (!c || !thisDeviceActive()) return;
    el.closest('.incoming')?.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const sig = await signAnswer(S.keys, answerPayload(S.circleId, { ...c, expiresMs: tsMs(c.expiresAt) }, v));
      await updateDoc(doc(db, 'circles', S.circleId, 'checks', c.id), { status: v, answeredAt: serverTimestamp(), sig, sigN: me().device.n });
      S.confirmYes = null;
      toast(v === 'confirmed' ? 'You confirmed the request' : 'You denied it. They’ve been told to stop.', v === 'confirmed' ? 'ok' : 'bad');
    } catch (e) { toast(isExpired(c) ? 'That check already expired.' : friendlyError(e), 'bad'); renderMain(); }
  },
  report: async (el) => {
    try { await updateDoc(doc(db, 'circles', S.circleId, 'checks', el.dataset.id), { reported: true }); toast('Reported. Everyone in your circle can see it in the log.'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'move-device': async () => {
    try {
      for (const id of S.profile.circles || []) {
        const ref = doc(db, 'circles', id, 'members', S.user.uid);
        const m = await getDoc(ref);
        if (!m.exists()) continue;
        const upd = { device: newDeviceRecord((m.data().device?.n || 0) + 1) };
        if (m.data().role !== 'admin') upd.status = 'pending';
        await updateDoc(ref, upd);
      }
      toast(me()?.role === 'admin' ? 'Verth now runs on this device. Your circle has been told.' : 'Moved to this device. An admin needs to re-approve you before you can use the circle.', 'ok');
      await afterSignIn(S.circleId);
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  approve: async (el) => {
    try { await updateDoc(doc(db, 'circles', S.circleId, 'members', el.dataset.uid), { status: 'active', approvedBy: S.user.uid, approvedAt: serverTimestamp() }); toast('Approved', 'ok'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  decline: async (el) => removeMember(el.dataset.uid, 'Declined'),
  'ask-remove': (el) => { S.confirmRemove = el.dataset.uid; renderMain(); },
  'ask-leave': () => { S.confirmRemove = 'leave'; renderMain(); },
  'cancel-remove': () => { S.confirmRemove = null; renderMain(); },
  remove: async (el) => removeMember(el.dataset.uid, 'Removed'),
  leave: async () => {
    const cid = S.circleId;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, 'circles', cid, 'members', S.user.uid));
      b.update(doc(db, 'circles', cid), { memberCount: increment(-1), lastRemoved: S.user.uid });
      b.update(doc(db, 'users', S.user.uid), { circles: arrayRemove(cid), activeCircle: null });
      stopListeners();
      await b.commit();
      S.profile.circles = (S.profile.circles || []).filter((x) => x !== cid);
      S.circle = null; toast('You left the circle.'); afterSignIn();
    } catch (e) { toast(friendlyError(e), 'bad'); afterSignIn(cid); }
  },
  'rotate-code': async () => {
    const old = S.circle.inviteCode, code = makeInviteCode();
    try {
      const b = writeBatch(db);
      b.update(doc(db, 'circles', S.circleId), { inviteCode: code });
      b.set(doc(db, 'invites', code), { circleId: S.circleId, circleName: S.circle.name, type: S.circle.type, createdBy: S.user.uid, createdAt: serverTimestamp() });
      b.delete(doc(db, 'invites', old));
      await b.commit();
      toast('New code ready. The old one no longer works.', 'ok');
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'join-open': async (el) => {
    try { await updateDoc(doc(db, 'circles', S.circleId), { joinOpen: el.dataset.v === '1' }); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  upgrade: async (el) => {
    if (PAY_API) {
      if (S.payBusy) return;
      return startCheckout(el.dataset.plan);
    }
    try {
      await updateDoc(doc(db, 'users', S.user.uid), { upgradeInterest: { plan: el.dataset.plan, circleId: S.circleId || null, at: serverTimestamp() } });
      S.profile.upgradeInterest = { plan: el.dataset.plan };
      toast('Thanks! We’ll let you know as soon as paid plans open.', 'ok'); renderScanView();
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'cancel-sub-ask': (el) => { S.confirmCancel = el.dataset.target; renderScanView(); },
  'cancel-sub-no': () => { S.confirmCancel = null; renderScanView(); },
  'cancel-sub': async (el) => {
    S.payBusy = 'cancel'; renderScanView();
    try {
      const r = await payApi('/cancel', { target: el.dataset.target, circleId: S.circleId || null });
      await refreshProfile();
      toast(`Renewal cancelled. Your plan stays on until ${r.until ? fmtDate(r.until) : 'the end of this month'}.`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { S.payBusy = null; S.confirmCancel = null; renderScanView(); }
  },
  csv: () => {
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // blocks spreadsheet formula injection
    const rows = [['time', 'checked_by', 'checked_with', 'channel', 'request', 'result', 'reported']]
      .concat(S.checks.map((c) => [new Date(tsMs(c.createdAt)).toISOString(), c.fromName, c.toName, c.channel, c.summary, statusOf(c), c.reported ? 'yes' : 'no']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `verth-log-${S.circleId}.csv`; a.click();
  },
};

async function removeMember(uid, word) {
  try {
    const b = writeBatch(db);
    b.delete(doc(db, 'circles', S.circleId, 'members', uid));
    b.update(doc(db, 'circles', S.circleId), { memberCount: increment(-1), lastRemoved: uid });
    await b.commit();
    S.confirmRemove = null; toast(word); renderMain();
  } catch (e) { toast(friendlyError(e), 'bad'); }
}

const forms = {
  scan: async (f) => {
    if (S.scanKind === 'image') return scanPhoto(f);
    const el = f.querySelector('textarea, input'), text = el.value.trim(); // first field is the content
    if (!text) return setErr('scan-err', S.scanKind === 'phone' ? 'Enter the phone number.' : S.scanKind === 'link' ? 'Paste the link.' : S.scanKind === 'job' ? 'Paste the job or exam email first.' : 'Paste the message first.');
    if (scanLimit() !== Infinity && (S.scanUsed ?? 0) >= scanLimit()) { S.scanResult = null; return renderScanView(); }
    busy(f, true);
    try { await useScan(); }
    catch (e) {
      busy(f, false);
      if (e?.code === 'permission-denied') { S.scanUsed = scanLimit(); S.scanResult = null; return renderScanView(); }
      return setErr('scan-err', friendlyError(e));
    }
    const r = check(S.scanKind, text, f.querySelector('#s-company')?.value || '');
    S.prefill = null;
    r.fp = r.normalized ? await fingerprint(r.kind, r.normalized) : null;
    S.scanResult = r;
    renderScanView();
    document.getElementById('scan-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadReportCount(r);
  },
  'otp-email': async (f) => {
    const email = f.querySelector('#a-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('a-err', 'That email address doesn’t look right.');
    busy(f, true); setErr('a-err', '');
    try { await sendCode(email); renderCode(); }
    catch (e) { setErr('a-err', friendlyError(e)); busy(f, false); }
  },
  'otp-code': async (f) => {
    const code = f.querySelector('#a-code').value.replace(/\D/g, '');
    if (code.length !== 6) return setErr('a-err', 'Enter all 6 digits from the email.');
    busy(f, true); setErr('a-err', '');
    try {
      const { token } = await otpApi('/otp/verify', { email: S.otpEmail, code });
      if (auth.currentUser) await signOut(auth);
      await signInWithCustomToken(auth, token);
    } catch (e) {
      setErr('a-err', friendlyError(e)); busy(f, false);
      const input = f.querySelector('#a-code'); input.value = ''; input.focus();
    }
  },
  'set-name': async (f) => {
    const name = f.querySelector('#n-name').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return setErr('n-err', 'Add your full name so people recognise you.');
    busy(f, true);
    try { await updateProfile(auth.currentUser, { displayName: name.slice(0, 60) }); S.user = auth.currentUser; await afterSignIn(); }
    catch (e) { setErr('n-err', friendlyError(e)); busy(f, false); }
  },
  create: async (f) => {
    const name = f.querySelector('#c-name').value.trim(), title = f.querySelector('#c-title').value.trim(), type = f.querySelector('#c-type').value;
    if (!name || !title) return setErr('s-err', 'Fill in both fields.');
    busy(f, true);
    try {
      const uid = S.user.uid, cref = doc(collection(db, 'circles')), code = makeInviteCode();
      const b = writeBatch(db);
      b.set(cref, { name: name.slice(0, 60), type, ownerUid: uid, inviteCode: code, joinOpen: true, plan: 'free', memberCount: 1, createdAt: serverTimestamp() });
      b.set(doc(db, 'circles', cref.id, 'members', uid), { uid, name: S.profile.name, title: title.slice(0, 40), email: S.user.email, role: 'admin', status: 'active', device: newDeviceRecord(1), joinedAt: serverTimestamp() });
      b.set(doc(db, 'invites', code), { circleId: cref.id, circleName: name.slice(0, 60), type, createdBy: uid, createdAt: serverTimestamp() });
      b.update(doc(db, 'users', uid), { circles: arrayUnion(cref.id), activeCircle: cref.id, onboarded: true });
      await b.commit();
      S.profile.circles = [...(S.profile.circles || []), cref.id];
      S.tab = 'circle';
      toast('Circle created. Now invite people.', 'ok');
      await afterSignIn(cref.id);
    } catch (e) { setErr('s-err', friendlyError(e)); busy(f, false); }
  },
  join: async (f) => {
    const code = f.querySelector('#j-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), title = f.querySelector('#j-title').value.trim();
    if (!/^[A-HJKMNP-Z2-9]{8}$/.test(code)) return setErr('s-err', 'Invite codes have 8 letters and numbers, like ABCD-2345.');
    if (!title) return setErr('s-err', 'Tell your circle who you are, like “Accounts” or “Son”.');
    busy(f, true);
    try {
      const inv = await getDoc(doc(db, 'invites', code));
      if (!inv.exists()) { setErr('s-err', 'That code doesn’t match any circle. Check it with the person who shared it.'); return busy(f, false); }
      const cid = inv.data().circleId, uid = S.user.uid;
      if ((S.profile.circles || []).includes(cid)) { await afterSignIn(cid); return; }
      const b = writeBatch(db);
      b.set(doc(db, 'circles', cid, 'members', uid), { uid, name: S.profile.name, title: title.slice(0, 40), email: S.user.email, role: 'member', status: 'pending', device: newDeviceRecord(1), inviteCode: code, joinedAt: serverTimestamp() });
      b.update(doc(db, 'circles', cid), { memberCount: increment(1) });
      b.update(doc(db, 'users', uid), { circles: arrayUnion(cid), onboarded: true });
      await b.commit();
      S.profile.circles = [...(S.profile.circles || []), cid];
      toast(`Request sent to ${inv.data().circleName}. Waiting for approval.`, 'ok');
      await afterSignIn();
    } catch (e) {
      setErr('s-err', e?.code === 'permission-denied' ? 'Couldn’t join. The circle may be full, closed to new members, or the code was changed. Ask the admin.' : friendlyError(e));
      busy(f, false);
    }
  },
  push: async (f) => {
    const toUid = f.querySelector('#v-who').value, what = f.querySelector('#v-what').value.trim(), channel = f.querySelector('#v-channel').value;
    if (!what) return setErr('v-err', 'Describe what they’re asking for, so the other person knows what to confirm.');
    if (!CHANNELS.includes(channel) || !member(toUid)) return setErr('v-err', 'Pick who it’s from and where it came from.');
    const lim = plan().checksPerMonth;
    if (monthChecks() >= lim) return setErr('v-err', `You’ve used all ${lim} free checks this month. Upgrade for unlimited checks.`);
    busy(f, true);
    try {
      const ref = doc(collection(db, 'circles', S.circleId, 'checks'));
      await logCheck(ref, {
        kind: 'push', fromUid: S.user.uid, fromName: me().name, toUid, toName: member(toUid).name,
        channel, summary: what.slice(0, 200), status: 'pending', createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + CHECK_TTL_SECONDS * 1000),
      });
      S.lastSentId = ref.id;
      f.querySelector('#v-what').value = '';
      renderMain();
    } catch (e) { setErr('v-err', friendlyError(e)); busy(f, false); }
  },
  code: async (f) => {
    const uid = f.querySelector('#v-code-who').value, raw = f.querySelector('#v-code').value.replace(/\D/g, '');
    if (raw.length !== 6) return setErr('v-err', 'Enter all 6 digits they read out.');
    const m = member(uid);
    if (!m?.device?.dh) return setErr('v-err', 'That person hasn’t set up Verth on a device yet.');
    const ok = await checkCode(S.keys, m.device.dh, S.circleId, uid, S.user.uid, raw);
    S.codeResult = { ok, name: m.name, uid };
    try {
      await logCheck(doc(collection(db, 'circles', S.circleId, 'checks')), {
        kind: 'code', fromUid: S.user.uid, fromName: me().name, toUid: uid, toName: m.name,
        channel: 'Call', summary: 'Code check', status: ok ? 'code-match' : 'code-mismatch', createdAt: serverTimestamp(),
      });
    } catch {}
    renderMain();
    const input = document.getElementById('v-code'); if (input) input.value = '';
  },
};

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); }
});
root.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f && forms[f.dataset.form]) { e.preventDefault(); forms[f.dataset.form](f); }
});
root.addEventListener('change', (e) => {
  if (e.target.id === 'circle-switch') openCircle(e.target.value);
  if (e.target.id === 'code-for') { S.codeFor = e.target.value; lastCodeKey = ''; tick(); }
  if (e.target.id === 's-image') setPhoto(e.target.files?.[0]);
});

// Paste or drop a screenshot anywhere on the Scam check screen.
const onScanScreen = () => !!document.querySelector('.kinds');
document.addEventListener('paste', (e) => {
  if (!S.user || !onScanScreen() || S.photoBusy) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) { e.preventDefault(); setPhoto(item.getAsFile()); }
});
root.addEventListener('dragover', (e) => { if (e.target.closest?.('.drop, .photo-pick')) { e.preventDefault(); e.target.closest('.drop, .photo-pick').classList.add('over'); } });
root.addEventListener('dragleave', (e) => e.target.closest?.('.drop, .photo-pick')?.classList.remove('over'));
root.addEventListener('drop', (e) => {
  if (!e.target.closest?.('.drop, .photo-pick')) return;
  e.preventDefault();
  setPhoto([...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')));
});

/* ---------- ticking UI: codes and countdowns ---------- */
let lastCodeKey = '', myCode = '';
async function tick() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const s = Math.max(0, Math.round((+el.dataset.countdown - Date.now()) / 1000));
    el.textContent = s > 0 ? `Expires in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.` : 'Expired.';
  });
  const codeEl = document.querySelector('[data-mycode]'), other = member(S.codeFor);
  if (codeEl && other?.device?.dh && S.keys) {
    const key = `${S.codeFor}|${Math.floor(Date.now() / 30000)}|${other.device.n}`;
    if (key !== lastCodeKey) { lastCodeKey = key; myCode = await codeFor(S.keys, other.device.dh, S.circleId, S.user.uid, S.codeFor); }
    codeEl.textContent = fmtCode(myCode);
  }
  const ring = document.querySelector('[data-ring]');
  if (ring) {
    const left = secondsLeft(), C = 2 * Math.PI * 18;
    ring.innerHTML = `<svg viewBox="0 0 44 44" aria-label="${left} seconds until the code changes"><circle class="track" cx="22" cy="22" r="18"/><circle class="prog" cx="22" cy="22" r="18" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - left / 30)).toFixed(1)}"/><text x="22" y="26.5" text-anchor="middle">${left}</text></svg>`;
  }
}
let expiredRerender = 0;
setInterval(() => {
  tick();
  rotate();
  if (S.circle && S.checks.some((c) => c.status === 'pending' && Math.abs(tsMs(c.expiresAt) - Date.now()) < 1000) && Date.now() - expiredRerender > 1500) {
    expiredRerender = Date.now(); setTimeout(renderMain, 1100);
  }
}, 1000);

/* ---------- Verth Helper ---------- */
// Takes the person to the right place from a helper answer.
function helperGo(to, text) {
  if (to === 'app') return;
  if (to === 'install') { location.href = './#install'; return; }
  if (!S.user || !S.user.emailVerified || !S.profile) { toast('Sign in first, then I can take you there.'); return; }
  if (to.startsWith('scan')) {
    const kind = to.split('-')[1] || 'message';
    S.scanKind = kind; S.scanResult = null;
    S.prefill = text ? { kind, text: text.slice(0, 6000), from: 'helper' } : null;
    if (!S.circle) { renderScanOnly(); window.scrollTo(0, 0); return; }
    to = 'scan';
  }
  if (!S.circle) { toast('Set up or join a circle first to use that.'); return; }
  S.tab = to; S.confirmRemove = null; if (to === 'verify') S.codeResult = null;
  renderMain(); window.scrollTo(0, 0);
}

// Optional Gemini answers (Firebase AI Logic). Off unless switched on in config.js,
// and only with App Check, so only the real Verth site can use the project's AI quota.
function makeAI() { return AI_HELPER.enabled ? makeServerAI(PAY_API) : null; }
const helper = mountHelper({ go: helperGo, ai: makeAI(), raised: true });

/* ---------- routing ---------- */
function route() {
  const u = S.user;
  if (!u) {
    stopListeners(); Object.assign(S, { circle: null, circleId: null, profile: null, keys: null, circles: {}, pending: [] });
    if (S.screen === 'auth' || S.screen === 'code') return; // already showing; don't wipe what they typed
    return renderAuth(SHARED ? 'Log in or create a free account, and Verth will check what you shared.' : '');
  }
  // Older accounts that never confirmed their email: confirm it with a code now.
  if (!u.emailVerified) {
    S.otpEmail = u.email;
    signOut(auth).catch(() => {});
    return sendCode(u.email).then(() => renderCode('Please confirm your email once.'), () => renderAuth());
  }
  afterSignIn().catch((e) => errorScreen(friendlyError(e)));
}

if ('serviceWorker' in navigator && !EMU) navigator.serviceWorker.register('sw.js').catch(() => {});

if (!CONFIGURED) renderNotConfigured();
else {
  // Show the log-in page straight away for people who aren't signed in on this device,
  // instead of waiting for Firebase to check.
  let hint = '';
  try { hint = localStorage.getItem('verth-signed-in') || ''; } catch {}
  if (!hint) route();
  onAuthStateChanged(auth, (u) => {
    try { if (u) localStorage.setItem('verth-signed-in', '1'); else localStorage.removeItem('verth-signed-in'); } catch {}
    S.user = u; route();
  });
}

// Exposed for automated tests only (never on the live site).
if (EMU) window.__verth = { S };
