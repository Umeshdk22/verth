import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signOut, updateProfile, deleteUser,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp, writeBatch, arrayUnion, arrayRemove, increment, getCountFromServer,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { makeServerAI } from './ai-client.js';
import { firebaseConfig, PLANS, CHECK_TTL_SECONDS, appCheckSiteKey, AI_HELPER, PAYMENTS, TURNSTILE_SITE_KEY } from './config.js';
import { passkeySupported, registerPasskey, loginWithPasskey, passkeyError } from './passkey.js';
import { mountHelper, looksSensitive } from './helper.js';
import qrcode from 'qrcode-generator';
import { COUNTRIES, countryBy, fullPhone } from './countries.js';
import { guardCard, viewGuard, guardSet, guardScore, guardRepeat, guardState, guardStreak, today as guardDay } from './guard.js';
import { deviceChecks, xrayText } from './phonelab.js';
import { videoCard, bindVideos, videoLang } from './videos.js';
import { QUOTES, ALERTS } from './showcase.js';
import { heroBanner, quoteCarousel, quickTiles, alertShow, stepsShow, rulesGrid, helplineBand, signOff, pageHead, rotate } from './showcase.js';
import { secondsLeft } from './totp.js';
import { check, checkImage, fingerprint, ADVICE, JOB_ADVICE, COMPANIES, detectKind } from './scamcheck.js';
import {
  deviceKeys, samePub, codeFor, checkCode, answerPayload, signAnswer, verifyAnswer, deviceLabel,
  chatKey, chatKeyId, sealBytes, openBytes, sealJson, openJson,
} from './devicekeys.js';

/* ---------- refuse to run inside another site's frame (clickjacking) ---------- */
/* global __TEST_ALLOW_FRAME__ */
// (__TEST_ALLOW_FRAME__ exists only in the local video/test build; the live site always refuses frames.)
if (window.top !== window.self && typeof __TEST_ALLOW_FRAME__ === 'undefined') {
  document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">For your safety, Verth can’t be shown inside another website. <a href="https://verth.in/app.html" target="_top">Open Verth directly</a>.</p>';
  throw new Error('framed');
}

/* ---------- setup ---------- */
const params = new URLSearchParams(location.search);
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && params.has('emu');
// The robot check is skipped in the local test build (it can't reach Cloudflare).
const CAPTCHA_KEY = EMU ? '' : TURNSTILE_SITE_KEY;
const cfg = EMU ? { apiKey: 'demo-key', authDomain: 'demo-verth.firebaseapp.com', projectId: 'demo-verth', appId: 'demo' } : firebaseConfig;
const CONFIGURED = EMU || !String(cfg.apiKey).includes('REPLACE');
const APP_URL = 'https://verth.in/app.html';
const SITE_URL = 'https://verth.in/';
// An invite link (join.html → app.html?invite=CODE) keeps the code until the person has joined.
(() => {
  const c = String(params.get('invite') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-HJKMNP-Z2-9]{8}$/.test(c)) { try { sessionStorage.setItem('verth-invite', c); } catch {} }
})();
const pendingInvite = () => { try { return sessionStorage.getItem('verth-invite') || ''; } catch { return ''; } };
const clearInvite = () => { try { sessionStorage.removeItem('verth-invite'); } catch {} };
// Tests can point payments at a stand-in server (local emulator builds only).
// (the address is fixed: a link can never point Verth at another server)
const PAY_API = EMU ? (params.has('payapi') ? 'https://pay.test.workers.dev' : '') : PAYMENTS.api;
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
const isOwner = () => !!S.circle && S.circle.ownerUid === S.user?.uid;
const admins = () => active().filter((m) => m.role === 'admin');
// Company email lock. Free email providers can never be a company domain (same list as the database rules).
const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com', 'live.in', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'rediffmail.com', 'rediff.com', 'aol.com', 'proton.me', 'protonmail.com',
  'pm.me', 'zoho.com', 'zohomail.in', 'zohomail.com', 'yandex.com', 'yandex.ru', 'mail.com', 'gmx.com', 'gmx.net',
  'tutanota.com', 'tuta.io', 'hey.com', 'fastmail.com', 'inbox.com', 'mail.ru', 'qq.com', '163.com', 'sify.com', 'indiatimes.com'];
const domainOf = (email) => String(email || '').toLowerCase().split('@')[1] || '';
const companyDomain = (email) => { const d = domainOf(email); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && !FREE_MAIL.includes(d) ? d : ''; };
// With two-admin approval, the first approval only counts for the device the person asked from.
const firstApproval = (m) => (m.firstApproval && m.firstApproval.n === m.device?.n ? m.firstApproval : null);
const fmtPhone = (p) => (/^\+91\d{10}$/.test(p || '') ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : /^\+[1-9]\d{6,14}$/.test(p || '') ? p : '');
const myPhone = () => (/^\+[1-9]\d{6,14}$/.test(S.profile?.phone || '') ? S.profile.phone : '');
// Phone numbers live in an admins-only record, never on the member record other members can read.
const phoneLink = (m) => { const p = S.contacts?.[m.uid]; return fmtPhone(p) ? ` · <a href="tel:${esc(p)}">${fmtPhone(p)}</a>${S.contactsV?.has(m.uid) ? ' <span class="ok-inline inline" title="Verified by SMS">✓ verified</span>' : ''}` : ''; };
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
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 4200);
}

// Re-render without losing what the person was typing. Passwords are never restored.
// A branded loading screen with rotating safety tips, so waiting is never a blank white page.
const LOAD_TIPS = ['Real banks never ask for your OTP or UPI PIN.', 'Pause. Verify. Then pay.', 'Never install an app from a link someone sends you.', 'To receive money, you never need to enter your PIN.', '“Urgent” is a scammer’s favourite word.'];
function renderLoading(msg = 'Opening your Verth…') {
  paint(`<div class="loader" role="status" aria-live="polite"><div class="ld-orb"><i></i><i></i>${ICON.check}</div><p class="ld-msg">${esc(msg)}</p><div class="ld-bar"><i></i></div><div class="ld-tips" aria-hidden="true">${LOAD_TIPS.map((t, i) => `<span style="--i:${i}">${esc(t)}</span>`).join('')}</div></div>`);
  S.screen = 'loading';
}
function paint(html) {
  if (/^\s*<div class="shell narrow">/.test(html)) html = authFrame(html);
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
  root.querySelectorAll('select[data-dial]').forEach(syncDial);
  { const tabs = !!root.querySelector('nav.tabs'); document.body.classList.toggle('has-tabs', tabs); document.body.classList.toggle('no-tabs', !tabs); } // where the help button sits
  document.body.classList.toggle('auth-bg', !!root.querySelector('.auth-frame')); // night-city backdrop behind log-in and set-up screens
  document.body.classList.toggle('in-chat', !!document.getElementById('chat-scroll')); // hide the help button over the message box
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
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.4 3.4 0 014.8 4.8l-8.4 8.4a1.7 1.7 0 01-2.4-2.4l7.7-7.7"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.6L21 12 3.4 3.4 3 10l12 2-12 2z"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.6.2 4.4 1.8 5 4.5"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/><path d="M8 7h7"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path d="M8.5 11h5M11 8.5v5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  finger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 7.5A7 7 0 0119 12v1.5"/><path d="M5 11.5c0-.9.2-1.8.5-2.6M12 8.2a3.8 3.8 0 013.8 3.8v2.3c0 2.2.6 4.2 1.6 5.7"/><path d="M8.2 12a3.8 3.8 0 01.6-2M8.2 14c0 2.8.9 5.2 2.4 7"/><path d="M12 12v2.3c0 2.7.8 5 2.2 6.7"/><path d="M5.3 15.5c.2 1.4.6 2.8 1.2 4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>',
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

// Log in (existing accounts only) or Create account. No passwords: an email code, Google, or
// fingerprint / face (passkey) once it's turned on.
let resendTimer;
const PHONE_RE = /^[6-9]\d{9}$/;
const maskEmail = (e) => { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}` : ''; };
// Gender, date of birth, country, and a phone box whose +code follows the chosen country.
const GENDERS = [['female', 'Female'], ['male', 'Male'], ['other', 'Other'], ['unsaid', 'Prefer not to say']];
const isoDay = (d) => d.toISOString().slice(0, 10);
function personFields(p, phonePlaceholder = '98765 43210') {
  const max = new Date(); max.setFullYear(max.getFullYear() - 13);
  return `<div class="row2 fields2">
      <label>Gender<select id="${p}-gender" required><option value="">Choose…</option>${GENDERS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label>Date of birth<input id="${p}-dob" type="date" required min="1900-01-01" max="${isoDay(max)}" autocomplete="bday"></label>
    </div>
    <label>Country<select id="${p}-country" data-dial="${p}-dial" autocomplete="country">${COUNTRIES.map((c) => `<option value="${c.iso}">${c.flag} ${esc(c.name)} (+${c.dial})</option>`).join('')}</select></label>
    <label>Mobile number<span class="phone-in"><span id="${p}-dial">+91</span><input id="${p}-phone" type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="16" placeholder="${phonePlaceholder}"></span></label>`;
}
// Keeps the +code next to the phone box in step with the country picker.
function syncDial(sel) {
  const c = countryBy(sel.value), out = document.getElementById(sel.dataset.dial);
  if (!out) return;
  out.textContent = '+' + c.dial;
  const ph = document.getElementById(sel.dataset.dial.replace('-dial', '-phone'));
  if (ph) ph.placeholder = c.iso === 'IN' ? '98765 43210' : 'Mobile number';
}
// Reads and checks the shared fields; returns { error } or the values.
function readPerson(f, p) {
  const gender = f.querySelector(`#${p}-gender`).value, dob = f.querySelector(`#${p}-dob`).value, country = f.querySelector(`#${p}-country`).value;
  if (!GENDERS.some(([v]) => v === gender)) return { error: 'Please choose your gender (or “Prefer not to say”).' };
  const born = new Date(dob + 'T00:00:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(born)) return { error: 'Please enter your date of birth.' };
  const age = (Date.now() - born.getTime()) / (365.25 * 864e5);
  if (age < 13) return { error: 'You need to be at least 13 to use Verth. Ask a parent to add you to their family circle.' };
  if (age > 120 || born.getFullYear() < 1900) return { error: 'Please check your date of birth.' };
  const phone = fullPhone(country, f.querySelector(`#${p}-phone`).value);
  if (!phone) return { error: country === 'IN' ? 'Please type a 10-digit Indian mobile number.' : `Please type your mobile number without the +${countryBy(country).dial}.` };
  return { gender, dob, country, phone };
}
const smsStep = () => S.smsOn && (S.profile?.phone || S.signupInfo?.phone || '+91').startsWith('+91');
const STEP_NAMES = () => ['Your details', 'Verify email', ...(smsStep() ? ['Verify mobile'] : []), ...(passkeySupported() ? ['Fingerprint'] : []), 'You’re in'];
const STEPS3 = (n) => `<ol class="steps3${STEP_NAMES().length > 3 ? ' four' : ''}" aria-label="${n > STEP_NAMES().length ? 'All steps done' : `Step ${n} of ${STEP_NAMES().length}`}">${STEP_NAMES().map((t, i) => { const skip = i + 1 < n && t === 'Fingerprint' && !store.get('verth-pk'); return `<li class="${skip ? 'skip' : i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''}"${skip ? ' title="Skipped. You can turn it on later."' : ''}><span>${skip ? '–' : i + 1 < n ? '✓' : i + 1}</span>${t}</li>`; }).join('')}</ol>`;
function renderAuth(note = '') {
  const signup = S.authMode === 'signup';
  const pk = passkeySupported();
  const last = store.get('verth-last');
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    <div class="seg auth-tabs" role="tablist"><button class="${signup ? '' : 'on'}" data-act="auth-tab" data-mode="login" role="tab" aria-selected="${!signup}">Log in</button><button class="${signup ? 'on' : ''}" data-act="auth-tab" data-mode="signup" role="tab" aria-selected="${signup}">Create account</button></div>
    ${signup ? `
    ${STEPS3(1)}
    <h1>Create your Verth account</h1>
    <p class="muted">Free for up to 5 people. It takes about a minute, and there’s no password to remember.</p>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <form data-form="signup" class="stack" novalidate>
      <label>Your full name<input id="a-name" autocomplete="name" required maxlength="60" placeholder="e.g. Asha Sharma"></label>
      <label>Email address<input id="a-email" type="email" inputmode="email" autocomplete="email" required maxlength="120" placeholder="you@example.com"></label>
      ${personFields('a')}
      <p class="muted small">We keep your number, birthday and gender private. Only admins of a circle you join see your number.</p>
      ${robotBox()}
      <label class="check"><input type="checkbox" id="a-agree" required> <span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.</span></label>
      <p class="err" id="a-err" role="alert"></p>
      <button class="btn primary big" type="submit">Send verification code</button>
    </form>
    ${passkeySupported() ? `<p class="bio-hint">${ICON.finger}<span>After your email, you’ll lock your account to your <b>fingerprint or face</b>, so next time you log in with one touch.</span></p>` : ''}
    <div class="or"><span>or</span></div>
    <button class="btn google" type="button" data-act="google">${ICON.google}Sign up with Google</button>
    <p class="muted small center">Already have an account? <button class="link" data-act="auth-tab" data-mode="login">Log in</button></p>`
    : `
    ${last?.name ? `<div class="me-card"><span class="me-av">${esc(last.name.charAt(0).toUpperCase())}</span><div><b>Welcome back, ${esc(last.name.split(/\s+/)[0])}</b><span class="muted small">${esc(maskEmail(last.email))}</span></div><button type="button" class="link" data-act="not-me">Not you?</button></div>`
      : '<h1>Log in to Verth</h1><p class="muted">Pick the quickest way for you. No password needed.</p>'}
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <p class="err" id="a-err" role="alert"></p>
    <div class="auth-quick">
      ${pk && store.get('verth-pk') ? `<button class="btn bio big" type="button" data-act="pk-login">${ICON.finger}Log in with fingerprint or face</button>` : ''}
      <button class="btn google big" type="button" data-act="google">${ICON.google}Continue with Google</button>
      ${pk && !store.get('verth-pk') ? `<button class="btn ghost" type="button" data-act="pk-login">${ICON.finger}Use fingerprint or face</button>` : ''}
    </div>
    <div class="or"><span>or get a code by email</span></div>
    <form data-form="otp-email" class="stack" novalidate>
      <label>Email address<input id="a-email" type="email" inputmode="email" autocomplete="email" required maxlength="120" placeholder="you@example.com" value="${esc(last?.email || '')}"></label>
      ${robotBox()}
      <button class="btn primary big" type="submit">Email me a code</button>
    </form>
    <p class="muted small center">New to Verth? <button class="link" data-act="auth-tab" data-mode="signup">Create an account</button></p>`}
  </div>
  <p class="foot">Want to look around first? <a href="demo.html">Try the demo</a>, no account needed.</p></div>`);
  S.screen = 'auth';
  if (signup) smsEnabled(); // shows the “Verify mobile” step when SMS checks are on
  mountCaptcha();
}

// Cloudflare Turnstile, loaded only when it's switched on.
let turnstileLoad = null;
// "I'm not a robot": the person must tick it themselves. Ticking runs Cloudflare's check quietly; a
// puzzle only appears if Cloudflare isn't sure. (Cloudflare's own box ticks itself, which looked odd.)
const robotBox = () => (CAPTCHA_KEY ? `<div class="robot" id="robot-wrap">
    <label class="rb-row"><input type="checkbox" id="robot" data-keep="no"><span class="rb-box" aria-hidden="true"></span><span class="rb-txt">I’m not a robot</span><span class="rb-state" id="rb-state" aria-live="polite"></span></label>
    <span class="rb-brand">Protected by Cloudflare</span>
    <div class="captcha" id="captcha"></div></div>` : '');
function robotState(kind, text) {
  const w = document.getElementById('robot-wrap'), st = document.getElementById('rb-state'), cb = document.getElementById('robot');
  if (!w) return;
  w.dataset.state = kind; if (st) st.textContent = text;
  const err = document.getElementById('a-err');
  if (kind === 'ok' && err && /robot/i.test(err.textContent)) err.textContent = '';
  if (cb && (kind === 'idle' || kind === 'error')) cb.checked = false;
}
function robotTick(on) {
  if (!on) { S.captcha = ''; try { window.turnstile?.reset(S.cfWidget); } catch {} return robotState('idle', ''); }
  if (S.captcha) return robotState('ok', 'Verified');
  robotState('busy', 'Checking…');
  // Never leave people stuck on "Checking…": after 10 seconds, let them carry on (the server still checks).
  clearTimeout(S.robotTimer);
  S.robotTimer = setTimeout(() => { if (!S.captcha && robotTicked()) { S.captchaFailed ||= 'timeout'; robotState('ok', ''); } }, 10000);
  const run = () => {
    if (!robotTicked() || S.captcha) return;
    if (!window.turnstile || S.cfWidget == null) { S.captchaFailed ||= 'load'; clearTimeout(S.robotTimer); return robotState('ok', ''); }
    try { window.turnstile.execute(S.cfWidget); } catch { clearTimeout(S.robotTimer); robotState('error', 'Couldn’t check. Tick again.'); }
  };
  // Still downloading the check on a slow connection? Wait for it instead of failing.
  if (window.turnstile && S.cfWidget != null) run(); else (turnstileLoad || Promise.reject(new Error('none'))).then(() => setTimeout(run, 50), run);
}
const robotTicked = () => !!document.getElementById('robot')?.checked;
function mountCaptcha() {
  S.captcha = ''; S.cfWidget = null;
  const box = document.getElementById('captcha');
  if (!box || !CAPTCHA_KEY) return;
  turnstileLoad ||= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    sc.async = true; sc.onload = resolve; sc.onerror = () => { turnstileLoad = null; reject(new Error('captcha')); };
    document.head.appendChild(sc);
  });
  turnstileLoad.then(() => {
    if (!document.body.contains(box) || !window.turnstile) return;
    S.cfWidget = window.turnstile.render(box, {
      sitekey: CAPTCHA_KEY, theme: 'light', retry: 'never', 'refresh-expired': 'manual',
      execution: 'execute', appearance: 'interaction-only',
      callback: (t) => { S.captcha = t; S.captchaFailed = ''; clearTimeout(S.robotTimer); robotState('ok', 'Verified'); },
      'expired-callback': () => { S.captcha = ''; robotState('idle', 'Expired. Tick again.'); },
      // If the check can't run in this browser, don't trap the person here: the server decides.
      'error-callback': (code) => { S.captcha = ''; S.captchaFailed = String(code || 'error'); robotState('ok', ''); return true; },
    });
  }).catch(() => { S.captchaFailed = 'load'; });
}
const resetCaptcha = () => { S.captcha = ''; try { window.turnstile?.reset(S.cfWidget); } catch {} robotState('idle', ''); };
// Ask for the robot check only while it's working; a broken check is reported but doesn't block.
const captchaHint = (msg) => (S.captchaFailed && /robot/i.test(msg) ? `${msg} The check couldn’t run in this browser (code ${S.captchaFailed}). Try turning off ad-blockers or “strict” tracking prevention, use Chrome, or tap “Log in with Google”.` : msg);
const needCaptcha = () => CAPTCHA_KEY && (!robotTicked() || (!S.captcha && !S.captchaFailed));

function renderCode(note = '') {
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    ${S.authMode === 'signup' ? STEPS3(2) : ''}
    <div class="state-icon mail">${ICON.mail}</div>
    <h1>${S.authMode === 'signup' ? 'Verify your email' : 'Check your email'}</h1>
    <p class="muted">We sent a 6-digit code to <b>${esc(S.otpEmail)}</b>. ${S.authMode === 'signup' ? 'Typing it here proves this email really belongs to you. ' : ''}It works for 10 minutes.</p>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <form data-form="otp-code" class="stack" novalidate>
      <label>6-digit code<input id="a-code" class="otp" data-keep="no" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" required placeholder="••••••" autofocus></label>
      <p class="err" id="a-err" role="alert"></p>
      <button class="btn primary big" type="submit">${S.authMode === 'signup' ? 'Verify and create my account' : 'Verify and log in'}</button>
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

// For accounts that don't have a Verth profile yet (signed up with Google, or never finished).
function renderCompleteProfile() {
  const u = S.user;
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    <div class="state-icon ok">${ICON.ok}</div>
    <h1>Almost done</h1>
    <p class="muted">Google has confirmed that <b>${esc(u.email)}</b> is your email, so no code is needed. Just a few details to finish your account.</p>
    <form data-form="complete-profile" class="stack" novalidate>
      <label>Your full name<input id="n-name" autocomplete="name" required maxlength="60" placeholder="e.g. Asha Sharma" value="${esc(u.displayName || '')}"></label>
      ${personFields('n')}
      <label class="check"><input type="checkbox" id="n-agree" required> <span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a>.</span></label>
      <p class="err" id="n-err" role="alert"></p>
      <button class="btn primary big" type="submit">Create my account</button>
    </form>
    <div class="links"><button class="link" data-act="signout">Cancel</button></div>
  </div></div>`);
}

// A special welcome for someone who has just joined.
function renderWelcome() {
  const first = esc(String(S.profile?.name || '').split(/\s+/)[0] || 'friend');
  const pk = passkeySupported() && !store.get('verth-pk');
  paint(`<div class="welcome">
    <div class="confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.35}s;--c:${['#FFB224', '#6B3DF0', '#14A897', '#EF5A5A', '#FFD3A1'][i % 5]}"></i>`).join('')}</div>
    <div class="shell narrow">
      <div class="welcome-card">
        ${STEPS3(9)}
        <div class="w-badge">${ICON.shield}</div>
        <span class="eyebrow">Your account is ready</span>
        <h1>Welcome to Verth, ${first}! 🎉</h1>
        <p class="lead">You’ve just made yourself a lot harder to scam. I’m really glad you’re here.</p>
        <ul class="w-ticks"><li>${ICON.ok}<span>Email verified</span></li>${phoneOk() ? `<li>${ICON.ok}<span>Mobile number verified</span></li>` : ''}${store.get('verth-pk') ? `<li>${ICON.ok}<span>Locked to your fingerprint / face</span></li>` : ''}<li>${ICON.ok}<span>Account secured, no password to steal</span></li><li>${ICON.ok}<span>Scam check ready to use</span></li></ul>
        <div class="w-note">
          <p>I built Verth after I paid ₹1,500 for a job exam at a company that didn’t exist. I never want that to happen to you or your family. Before you pay, share an OTP or trust an “urgent” message, check it here first.</p>
          <p class="sig">— Umesh, founder of Verth</p>
        </div>
        ${pk ? `<div class="w-bio"><div class="w-bio-ic">${ICON.finger}</div><div><b>Log in faster next time</b><span>Use your fingerprint or face instead of typing your email. You can change this any time in your profile.</span></div></div>
          <p class="err" id="w-err" role="alert"></p>
          <button class="btn primary big" data-act="welcome-pk">Turn on fingerprint / face login</button>
          <button class="btn ghost" data-act="welcome-go">Maybe later</button>`
        : '<button class="btn primary big" data-act="welcome-go">Let’s get started</button>'}
      </div>
    </div></div>`);
}

// Talks to the Verth server (email codes, passkey login). Signed-in calls go through payApi.
async function otpApi(path, body, token = '') {
  if (!PAY_API) throw Object.assign(new Error('Email codes aren’t switched on yet. Use Continue with Google for now.'), { otp: true });
  let r;
  try { r = await fetch(PAY_API.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); }
  catch { throw Object.assign(new Error('You seem to be offline. Check your connection.'), { otp: true }); }
  const j = await r.json().catch(() => ({}));
  // An older server that doesn't know email codes answers "Sign in again." (401).
  if ((r.status === 401 && j.error === 'Sign in again.') || (r.status === 404 && !j.error)) throw Object.assign(new Error('Email codes aren’t switched on yet. Use Continue with Google for now.'), { otp: true });
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again in a minute.'), { otp: true, status: r.status });
  return j;
}
async function sendCode(email, extra = {}, token = '') {
  const j = await otpApi('/otp/send', { email, mode: S.authMode === 'signup' ? 'signup' : 'login', captcha: S.captcha || '', ...extra }, token);
  S.otpEmail = email.trim().toLowerCase();
  S.emailOk = '';
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

function renderSetup(type, code = '') {
  const fam = type === 'family', join = type === 'join';
  paint(`<div class="shell narrow">${brand}<div class="panel">
    ${join ? `<h1>Join a circle</h1><p class="muted">${code ? 'Your invite code is filled in. Tell the circle how they know you, then tap “Ask to join”.' : 'Enter the 8-character code the circle admin shared with you.'} The admin approves you before you can see anything.</p>
      <form data-form="join" class="stack" novalidate>
        <label>Invite code<input id="j-code" required maxlength="9" placeholder="ABCD-2345" autocapitalize="characters" autocomplete="off" class="mono" value="${code ? esc(fmtInvite(code)) : ''}"></label>
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
  ['chat', 'Chat', ICON.chat], ['circle', 'Circle', ICON.people], ['plan', 'Plan', ICON.star],
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
    chat: S.chatWith ? null : ['Private chat', 'Talk privately', 'Messages, documents and payments between two people. Locked to your two phones.', 'sms', 'teal'],
    plan: ['Plan & account', 'Plans and billing', 'Your plan, your subscription and this device.', 'key', 'amber'],
    guard: null,
    profile: null,
    guide: ['Guide', 'How Verth keeps you safe', 'Real examples of when to check, and how.', 'heart', 'teal'],
  }[S.tab];
  const vid = ['scan', 'verify', 'circle', 'log', 'plan', 'guard'].includes(S.tab) || (S.tab === 'chat' && !S.chatWith) ? videoCard(S.tab) : S.tab === 'home' && inTrial() ? videoCard('intro') : '';
  const body = (HEAD ? pageHead(...HEAD) : '') + vid + { home: viewHome, scan: viewScan, verify: viewVerify, guard: () => viewGuard(guardOpts()), profile: viewProfile, chat: viewChat, circle: viewCircle, log: viewLog, guide: viewGuide, plan: viewPlan }[S.tab]();
  const waiting = isAdmin() ? S.members.filter((m) => m.status === 'pending').length : 0;
  const unread = unreadCount();
  // Keep the chat scrolled to the newest message, unless the person scrolled up to read.
  const box = document.getElementById('chat-scroll');
  const keepPos = box ? { top: box.scrollTop, stick: box.scrollHeight - box.scrollTop - box.clientHeight < 90, who: S.chatShown } : null;
  paint(`<div class="app${S.tab === 'chat' && S.chatWith ? ' in-chat' : ''}">
    <header class="top">${brand}
      <div class="circle-pick">
        ${circles.length > 1
          ? `<select id="circle-switch" aria-label="Switch circle" data-keep="no">${circles.map(([id, c]) => `<option value="${esc(id)}" ${id === S.circleId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
          : `<b>${esc(S.circle.name)}</b>`}
        <span class="tag">${S.circle.type === 'family' ? 'Family' : 'Organisation'} · ${esc(plan().name)}</span>
      </div>
      ${headAvatar()}
    </header>
    <main class="content">
      ${thisDeviceActive() ? '' : `<div class="warn strong"><b>Verth is set up on another device${me()?.device?.label ? ` (${esc(me().device.label)})` : ''}.</b> Answers and codes only work there. If you’ve switched phones, move Verth here. Everyone in your circle will be told you changed device.
        <button class="btn small" data-act="move-device">Use this device instead</button></div>`}
      ${S.tab === 'chat' && S.chatWith ? '' : trialBanner()}
      ${waiting ? `<div class="banner accent"><span><b>${waiting} ${waiting > 1 ? 'people are' : 'person is'} waiting</b> for your approval to join.</span><button class="btn small" data-act="tab" data-tab="circle">Review</button></div>` : ''}
      ${body}
    </main>
    <nav class="tabs" aria-label="Sections">${TABS.map(([id, label, ic]) => `<button class="${S.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" aria-current="${S.tab === id ? 'page' : 'false'}">${ic}<span>${label}</span>${id === 'chat' && unread ? `<i class="badge" aria-label="${unread} unread">${unread}</i>` : ''}</button>`).join('')}
      ${[['log', 'Verification log', ICON.log], ['guard', 'Safety check-up', ICON.shield], ['guide', 'How to use Verth', ICON.book], ['profile', 'My profile', ICON.user]].map(([id, label, ic]) => `<button class="xtra ${S.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${ic}<span>${label}</span></button>`).join('')}
      <div class="nav-card xtra"><b>Stay one step ahead</b><span>Before you pay, share an OTP or trust an “urgent” message, check it on Verth.</span></div></nav>
    ${rail()}
  </div>`);
  const nb = document.getElementById('chat-scroll');
  if (nb) nb.scrollTop = !keepPos || keepPos.stick || keepPos.who !== S.chatWith ? nb.scrollHeight : keepPos.top;
  S.chatShown = nb ? S.chatWith : null;
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
  const used = monthChecks(), lim = checkLimit();
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
    ${guardCard()}
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

/* ---------- inviting people ---------- */
// A personal link to the invite page, with who invited them and to which circle.
function inviteLink() {
  const c = S.circle, first = String(me()?.name || S.profile?.name || '').trim().split(/\s+/)[0];
  const q = new URLSearchParams({ c: c.inviteCode, by: first.slice(0, 40), n: c.name.slice(0, 60), t: c.type === 'org' ? 'org' : 'family', ...(c.domain ? { d: c.domain } : {}) });
  return `${SITE_URL}join.html?${q}`;
}
function inviteMessage() {
  const c = S.circle, fam = c.type === 'family';
  return `Hi! 👋 I’m using Verth to protect ${fam ? 'our family' : 'our team'} from scams. Please join our circle “${c.name}”, so before anyone pays money or shares an OTP because of a message or call, we can check with the real person on their own phone. It’s free and takes a minute 🙏\n\n👉 ${inviteLink()}\n\nInvite code: ${fmtInvite(c.inviteCode)}\n\nहमारे सर्कल से जुड़िए, ताकि पैसे भेजने से पहले हम एक-दूसरे से पक्का कर सकें।`;
}
// Android Chrome can open the phone's contact list (the browser asks first). Elsewhere we use the share sheet.
const contactsSupported = () => typeof navigator !== 'undefined' && 'contacts' in navigator && typeof navigator.contacts?.select === 'function';
// Indian mobile numbers become 91XXXXXXXXXX for WhatsApp links.
function waNumber(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) d = '91' + d;
  return /^\d{11,15}$/.test(d) ? d : '';
}

function companyCard() {
  const c = S.circle, mine = companyDomain(S.user.email), list = S.allow || [], nAdmins = admins().length;
  const lock = c.domain
    ? `<p class="muted">Only people with an <b>@${esc(c.domain)}</b> email can ask to join, and your circle shows a <b>Verified company</b> badge. A scammer with a Gmail can’t even ask.</p>
       <button class="btn small ghost" data-act="company-lock" data-v="0">Turn off the company lock</button>`
    : mine
      ? `<p class="muted">Only people with an <b>@${esc(mine)}</b> email will be able to ask to join, and your circle gets a <b>Verified company</b> badge, because you proved you own an @${esc(mine)} mailbox.</p>
         ${list.length || active().some((m) => domainOf(m.email) !== mine) ? `<p class="muted small">People already in the circle stay in, even with other emails.</p>` : ''}
         <button class="btn primary" data-act="company-lock" data-v="1">${ICON.check}Lock to @${esc(mine)}</button>`
      : `<p class="muted">You’re logged in with a personal email (@${esc(domainOf(S.user.email))}), so this can’t be turned on from your account. To get the Verified company badge, an admin who logs in with a work email (like you@yourcompany.in) turns it on.</p>`;
  const joined = new Set(S.members.map((m) => String(m.email || '').toLowerCase()));
  const rows = list.slice(0, 300).map((a) => `<li><span class="grow"><b>${esc(a.name || a.email)}</b>${a.name ? `<span class="muted small">${esc(a.email)}</span>` : ''}</span>
      ${joined.has(a.email) ? '<span class="small ok-inline">Joined</span>' : ''}<button class="btn small ghost" data-act="allow-remove" data-email="${esc(a.email)}">Remove</button></li>`).join('');
  return `<section class="card org-sec"><h2>Company security</h2>
    <h3>Company email lock</h3>${lock}
    <hr class="soft">
    <h3>Staff list</h3>
    <p class="muted">Add the work emails of the people you expect. ${c.listOnly ? '<b>Only people on this list can ask to join.</b>' : 'Turn on “only people on the list” to block everyone else, even if your invite code leaks.'} You still approve each person.</p>
    <form data-form="allow-add" class="stack" novalidate>
      <label>Add people<textarea id="al-list" rows="3" maxlength="60000" placeholder="One per line: name, email (or just the email). You can paste straight from Excel."></textarea></label>
      <p class="err" id="al-err" role="alert"></p>
      <div class="row gap"><button class="btn small primary" type="submit">Add to the list</button>
      ${c.listOnly ? '<button type="button" class="btn small ghost" data-act="list-only" data-v="0">Let anyone with the code ask</button>' : `<button type="button" class="btn small" data-act="list-only" data-v="1" ${list.length ? '' : 'disabled'}>Only people on the list</button>`}</div>
    </form>
    ${list.length ? `<p class="muted small">${list.length} ${list.length === 1 ? 'person' : 'people'} on the list.</p><ul class="list allow-list">${rows}</ul>` : ''}
    <hr class="soft">
    <h3>Two-admin approval</h3>
    <p class="muted">Each new person, and anyone moving to a new phone, needs approval from <b>two different admins</b>. One fooled or hacked admin isn’t enough.</p>
    ${c.twoAdmins
      ? '<p class="small ok-inline">On. Two admins approve everyone.</p><button class="btn small ghost" data-act="two-admins" data-v="0">Turn off</button>'
      : nAdmins >= 2
        ? '<button class="btn small primary" data-act="two-admins" data-v="1">Turn on two-admin approval</button>'
        : `<p class="muted small">You need at least two admins first. ${isOwner() ? 'Tap “Make admin” next to a trusted person above.' : 'Ask the circle owner to make another admin.'}</p>`}
  </section>`;
}

function viewCircle() {
  const c = S.circle, lim = memberLimit(), admin = isAdmin();
  const pending = S.members.filter((m) => m.status === 'pending');
  const msg = inviteMessage();
  const row = (m) => {
    const removable = admin && m.uid !== S.user.uid && m.role !== 'admin';
    const owner = c.ownerUid === m.uid;
    const roleBtn = isOwner() && m.uid !== S.user.uid && c.type === 'org'
      ? (m.role === 'admin'
        ? (c.twoAdmins && admins().length <= 2 ? '' : `<button class="btn small ghost" data-act="set-role" data-uid="${esc(m.uid)}" data-v="member">Remove admin</button>`)
        : `<button class="btn small ghost" data-act="set-role" data-uid="${esc(m.uid)}" data-v="admin">Make admin</button>`)
      : '';
    return `<li>${ava(m)}
      <span class="grow"><b>${esc(m.name)}${m.uid === S.user.uid ? ' (you)' : ''}</b><span class="muted small">${esc(m.title || '')}${owner ? ' · owner' : m.role === 'admin' ? ' · admin' : ''} · ${esc(m.email || '')}${admin ? phoneLink(m) : ''}</span>
      ${newDevice(m) ? `<span class="small warn-inline">New device ${ago(tsMs(m.device.at))}</span>` : ''}</span>
      ${roleBtn}
      ${removable ? (S.confirmRemove === m.uid
        ? `<span class="row gap"><button class="btn small bad" data-act="remove" data-uid="${esc(m.uid)}">Remove</button><button class="btn small" data-act="cancel-remove">Keep</button></span>`
        : `<button class="btn small ghost" data-act="ask-remove" data-uid="${esc(m.uid)}">Remove</button>`) : ''}</li>`;
  };
  return `
  ${admin && pending.length ? `<section class="card attention"><h2>Waiting for your approval</h2>
    <p class="muted small">Only approve people you know. Check the email address and phone number, not just the name: a scammer can type any name.${c.twoAdmins ? ' Two different admins must approve each person.' : ''}</p>
    <ul class="list people">${pending.map((m) => { const f = c.twoAdmins ? firstApproval(m) : null, mineFirst = f && f.by === S.user.uid;
      return `<li><span class="avatar">${initials(m.name)}</span>
      <span class="grow"><b>${esc(m.name)}</b><span class="muted small">${esc(m.title || '')} · ${esc(m.email || '')}${phoneLink(m)} · asked ${fmtTime(m.joinedAt)}</span>
      ${f ? `<span class="small ok-inline">${mineFirst ? 'You approved. Waiting for a second admin.' : `Approved by ${esc(member(f.by)?.name || 'an admin')}. Needs your approval too.`}</span>` : ''}</span>
      <span class="row gap">${mineFirst ? '' : `<button class="btn small ok" data-act="approve" data-uid="${esc(m.uid)}">${c.twoAdmins ? (f ? 'Approve (2 of 2)' : 'Approve (1 of 2)') : 'Approve'}</button>`}<button class="btn small ghost" data-act="decline" data-uid="${esc(m.uid)}">Decline</button></span></li>`; }).join('')}</ul></section>` : ''}
  ${c.type === 'org' && c.domain ? `<div class="vbadge-row"><span class="vbadge">${ICON.check}Verified company</span><span class="muted small">Only <b>@${esc(c.domain)}</b> emails can join ${esc(c.name)}.</span></div>` : ''}
  <section class="card"><h2>Invite people</h2>
    ${c.joinOpen === false
      ? `<p class="muted">Joining is turned off. Nobody can use an invite code until an admin turns it back on.</p>${admin ? '<button class="btn primary" data-act="join-open" data-v="1">Turn joining on</button>' : ''}`
      : `<p class="muted">${c.type === 'family' ? 'Share this code in your family WhatsApp group.' : 'Share this code with the people who request and approve payments or access.'} ${admin ? 'You approve everyone before they can see anything.' : 'An admin approves everyone who joins.'}</p>
    <div class="inv-actions">
      ${contactsSupported() ? `<button class="btn primary big" data-act="invite-contacts">${ICON.people}Invite from my contacts</button>` : ''}
      <button class="btn ${contactsSupported() ? 'ghost' : 'primary big'}" data-act="invite-share">${ICON.share}${contactsSupported() ? 'Share the invite another way' : 'Send an invite (WhatsApp, SMS…)'}</button>
    </div>
    ${S.picked?.length ? `<div class="picked"><b>Send your invite</b><span class="muted small">Tap WhatsApp or SMS for each person. Your contacts stay on this phone; Verth never uploads them.</span>
      <ul class="list">${S.picked.map((p, i) => `<li><span class="avatar">${initials(p.name || '?')}</span><span class="grow"><b>${esc(p.name || p.tel)}</b><span class="muted small">${esc(p.tel)}</span></span>
        <span class="row gap">${p.wa ? `<a class="btn small wa" href="https://wa.me/${p.wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" data-act="sent" data-i="${i}">${p.sent ? '✓ ' : ''}WhatsApp</a>` : ''}<a class="btn small ghost" href="sms:${encodeURIComponent(p.tel)}?body=${encodeURIComponent(msg)}" data-act="sent" data-i="${i}">SMS</a></span></li>`).join('')}</ul>
      <button class="link" data-act="picked-clear">Done</button></div>` : ''}
    <div class="invite"><span class="mono">${fmtInvite(c.inviteCode)}</span><button class="btn small" data-act="copy" data-text="${esc(c.inviteCode)}">Copy code</button></div>
    <button class="link" data-act="copy" data-text="${esc(msg)}">Copy the invite message</button>
    ${admin ? '<div class="row gap"><button class="btn small ghost" data-act="rotate-code">Change code</button><button class="btn small ghost" data-act="join-open" data-v="0">Turn joining off</button></div><p class="muted small">Change the code if it was shared somewhere public. The old code stops working immediately.</p>' : ''}`}
    <p class="muted small">${c.plan === 'team' ? `${c.memberCount || S.members.length} people on the Team plan, no limit.` : `${c.memberCount || S.members.length} of ${lim} places used on the ${esc(plan().name)} plan.`}</p></section>
  <section class="card"><h2>People in ${esc(c.name)}</h2><ul class="list people">${active().map(row).join('')}</ul>
    ${isOwner() && c.type === 'org' && admins().length < 2 ? '<p class="muted small">Tip: make a second trusted person an admin, so someone can approve people when you’re busy.</p>' : ''}</section>
  ${admin && c.type === 'org' ? companyCard() : ''}
  <section class="card"><div class="split"><h2>Verification log</h2><button class="btn small" data-act="tab" data-tab="log">${ICON.log}Open the log</button></div>
    <p class="muted small">Every check in ${esc(c.name)}, who asked and what they answered. It can’t be edited or deleted.</p></section>
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
// 7-day free trial: everything unlimited for a week from sign-up. The database rules enforce the
// same week from the profile's createdAt, so it can't be extended from the app.
const TRIAL_DAYS = 7;
const trialEnd = () => (S.profile?.createdAt ? tsMs(S.profile.createdAt) : Date.now()) + TRIAL_DAYS * 864e5;
const inTrial = () => !!S.profile && Date.now() < trialEnd();
const trialDaysLeft = () => Math.max(0, Math.ceil((trialEnd() - Date.now()) / 864e5));
const checkLimit = () => (inTrial() ? Infinity : plan().checksPerMonth);
const memberLimit = () => (inTrial() && isOwner() && plan().maxMembers < 25 ? 25 : plan().maxMembers);
function trialBanner() {
  if (!S.profile) return '';
  const paid = (S.profile.plan && S.profile.plan !== 'free') || circlePaid();
  if (paid) return '';
  if (inTrial()) {
    const d = trialDaysLeft();
    return `<div class="trial-banner"><span class="tb-ic">✨</span><span class="grow"><b>Free trial: ${d <= 1 ? 'last day' : `${d} days left`}</b><span>Everything is unlimited until ${new Date(trialEnd()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Then you’re on the Free plan, or choose a plan you like.</span></span><button class="btn small" data-act="tab" data-tab="plan">See plans</button></div>`;
  }
  if (Date.now() - trialEnd() < 5 * 864e5 && !store.get('verth-trial-seen')) {
    return `<div class="trial-banner ended"><span class="tb-ic">⏳</span><span class="grow"><b>Your 7-day free trial has ended</b><span>You’re on the Free plan now: everything still works, with daily limits. Upgrade to keep it unlimited.</span></span><button class="btn small" data-act="trial-plans">See plans</button></div>`;
  }
  return '';
}
const photoLimit = () => ((S.profile?.plan && S.profile.plan !== 'free') || circlePaid() || inTrial() ? Infinity : PLANS.free.photoChecks);
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
const scanLimit = () => ((S.profile?.plan && S.profile.plan !== 'free') || circlePaid() || inTrial() ? Infinity : PLANS.free.scansPerDay);
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
// Shared scam database. When a check finds a scam (high risk), this phone records it for everyone:
// only a scrambled fingerprint of the message, link, number or picture text is stored, never the
// content. Everyone who later checks the same thing sees how many times it was flagged and reported.
async function autoFlag(r) {
  if (r?.verdict !== 'danger') return;
  const kind = (k) => (k === 'link' || k === 'phone' ? k : 'message');
  const fps = [];
  if (r.fp) fps.push([r.fp, kind(r.kind)]);
  for (const l of r.links || []) if (l.verdict === 'danger' && l.normalized) fps.push([await fingerprint('link', l.normalized), 'link']);
  await Promise.all(fps.map(([fp, k]) => setDoc(doc(db, 'reports', fp, 'auto', S.user.uid), { kind: k, at: serverTimestamp() }).catch(() => {})));
}
async function loadReportCount(r) {
  if (!r?.fp) return;
  await autoFlag(r).catch(() => {});
  try {
    const a = await getCountFromServer(collection(db, 'reports', r.fp, 'auto'));
    S.flags ||= {}; S.flags[r.fp] = a.data().count;
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
  // Only Verth's own checks add to the scam database (no report button that people could misuse).
  // Several different people's checks finding a scam outweighs a clean result now.
  const flagged = S.flags?.[r.fp] || 0, crowd = flagged >= 2;
  const what = { link: 'link', phone: 'number', message: 'message', job: 'offer', image: 'message' }[r.kind];
  const isJob = r.kind === 'job' || r.sub === 'job';
  const qr = r.qr;
  return `<div class="result verdict ${cls}" id="scan-result">
    <div class="split"><div class="state-icon ${cls}">${cls === 'ok' ? ICON.ok : cls === 'bad' ? ICON.bad : ICON.wait}</div>
      <div class="meter" aria-label="Risk ${Math.min(10, r.score)} out of 10"><span style="width:${Math.min(100, 8 + r.score * 11)}%"></span></div></div>
    <h2>${head}</h2>
    ${crowd && r.verdict !== 'danger' ? `<div class="crowd-warn">⚠️ <b>Verth’s scam database knows this ${what}.</b> Verth found it to be a scam in ${flagged} earlier checks. Don’t pay, share an OTP or click anything.</div>` : ''}
    ${r.kind === 'phone' && r.normalized ? `<p class="mono">${esc(r.normalized)}</p>` : r.kind === 'link' && r.host ? `<p class="mono">${esc(r.host)}</p>` : ''}
    ${flags.length ? `<ul class="flags">${flags.map((f) => `<li class="lv${f.level}"><b>${esc(f.title)}</b><span>${esc(f.why)}</span></li>`).join('')}</ul>` : ''}
    ${r.good.length ? `<ul class="goods">${r.good.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    ${r.links?.length ? `<div class="found"><b>Links found</b>${r.links.map((l) => `<div class="split small"><span class="mono">${esc(l.host || l.normalized)}</span><span class="pill ${VERDICT[l.verdict][0]}">${l.verdict === 'danger' ? 'High risk' : l.verdict === 'caution' ? 'Careful' : 'No flags'}</span></div>`).join('')}</div>` : ''}
    <div class="community">${flagged ? `<span class="cm-stats"><b>🛡️ In Verth’s scam database: found to be a scam in ${flagged} ${flagged === 1 ? 'check' : 'checks'}</b></span>` : `<span>🛡️ Checked against Verth’s scam database: no scam record for this ${what} yet.</span>`}
      ${r.verdict === 'danger' ? '<span class="small muted">Verth saved this to its scam database by itself, so everyone who checks it next is warned. Only a scrambled fingerprint is kept, never the content.</span>' : '<span class="small muted">Verth adds anything it finds to be a scam to the database automatically. Nobody can mark a number or link as a scam by hand.</span>'}</div>
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
  const banner = S.prefill ? `<div class="banner accent"><span><b>${S.prefill.from === 'helper' ? 'From Verth Helper.' : S.prefill.from === 'chat' ? 'From a private chat.' : 'Shared to Verth.'}</b> Check it below before you reply, click or pay.</span></div>` : '';
  return `${banner}<section class="card"><div class="split"><h2>Scam check</h2>${counter}</div>
      <p class="muted">What do you want to check? Tap one.</p>
      ${tiles}
      ${left === 0 && !r ? '' : `<form data-form="scan" class="stack" novalidate>${field}<p class="err" id="scan-err" role="alert"></p><button class="btn primary big" type="submit" ${S.photoBusy ? 'disabled' : ''}>${S.photoBusy ? '<span class="spin" aria-hidden="true"></span> Reading your picture…' : 'Check it'}</button></form>`}
      <p class="muted small">${img ? 'Your picture stays on your phone. Verth reads it here and never uploads it.' : 'Checks run on your device. Verth doesn’t store what you paste.'} If it turns out to be a scam, Verth saves only a scrambled fingerprint so others are warned.</p></section>
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
  logScan(r, '');
  S.photoBusy = null; S.scanResult = r;
  renderScanView();
  document.getElementById('scan-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadReportCount(r);
}

/* ---------- phone check-up tools: device checks, App X-ray, Phone Doctor, circle board ---------- */
const FREE_TOOLS = { xray: 1, doctor: 3 }; // a day, on the free plan
function toolUse() { const u = store.get('verth-gtools') || {}; return u.day === guardDay() ? u : { day: guardDay(), xray: 0, doctor: 0 }; }
function toolSpend(k) { const u = toolUse(); u[k] = (u[k] || 0) + 1; store.set('verth-gtools', u); }
const toolsPaid = () => !!unlimitedTalk();
const toolLeft = (k) => Math.max(0, FREE_TOOLS[k] - (toolUse()[k] || 0));
const shareKey = () => `verth-gshare-${S.user?.uid}-${S.circleId}`;
const sharing = () => !!(S.circleId && store.get(shareKey()) === 1);
function guardOpts() {
  return {
    paid: toolsPaid(), device: S.gDevice, xray: S.xray, xrayBusy: S.xrayBusy, xrayLeft: toolLeft('xray'),
    doctor: S.doctor, doctorBusy: S.doctorBusy, doctorLeft: toolLeft('doctor'), lang: videoLang(),
    inCircle: !!S.circleId, board: boardRows(), boardOpen: circlePaid() || inTrial(), shareOn: sharing(),
  };
}
function boardRows() {
  if (!S.circleId || !S.board) return [];
  return Object.entries(S.board).map(([uid, b]) => ({ uid, me: uid === S.user?.uid, name: member(uid)?.name || 'Member', score: Number(b.score) || 0, streak: Number(b.streak) || 0, today: b.day === guardDay() }))
    .filter((r) => member(r.uid)?.status === 'active').sort((a, b) => Number(b.me) - Number(a.me) || Number(b.today) - Number(a.today) || a.score - b.score);
}
// Runs when the check-up opens: what the browser can tell, and the circle board.
async function guardExtras() {
  if (!S.gDevice) {
    try { S.gDevice = await deviceChecks(); } catch { S.gDevice = { results: [] }; }
    // A screen lock the browser can see counts as today's "Screen lock is on".
    if (S.gDevice.results?.some((r) => r.id === 'lock' && r.state === 'ok') && !guardState().lock) { guardSet('lock', true); shareScore(); }
  }
  if (S.circleId) {
    if (sharing()) await shareScore();
    try { const snap = await getDocs(collection(db, 'circles', S.circleId, 'safety')); S.board = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])); } catch { S.board = S.board || {}; }
  }
  if (S.tab === 'guard' || S.soloTab === 'guard') renderScanView();
}
async function shareScore() {
  if (!sharing()) return;
  const data = { score: guardScore(), day: guardDay(), streak: guardStreak() };
  try { await setDoc(doc(db, 'circles', S.circleId, 'safety', S.user.uid), { ...data, at: serverTimestamp() }); S.board = { ...(S.board || {}), [S.user.uid]: data }; } catch (e) { console.warn('share score', e?.code); }
}
async function runXray(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) return toast('That file isn’t a picture. Choose a screenshot.', 'bad');
  if (!toolsPaid() && toolLeft('xray') <= 0) return renderScanView();
  S.xray = null; S.xrayBusy = { stage: 'Opening your screenshot', pct: 3 }; renderScanView();
  let read;
  try {
    const mod = await import(OCR_MODULE);
    read = await mod.readImage(file, (stage, pct) => {
      S.xrayBusy = { stage, pct };
      const a = document.getElementById('xray-stage'), b = document.getElementById('xray-bar');
      if (a) a.textContent = stage; if (b) b.style.width = pct + '%';
    });
  } catch (e) {
    S.xrayBusy = null; renderScanView();
    return setErr('xray-err', e?.message === 'too-big' ? 'That picture is too large. Try a normal screenshot.' : 'Couldn’t read the screenshot. Check your internet (the reader downloads once), then try again.');
  }
  const r = xrayText(read.text);
  S.xrayBusy = null;
  if (r.unreadable) { renderScanView(); return setErr('xray-err', 'Verth couldn’t read app names in this picture. Take a clear screenshot of your apps list. This didn’t use up your free X-ray.'); }
  toolSpend('xray'); S.xray = r; renderScanView();
  document.getElementById('xray-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
let doctorAI = null;
async function askDoctor(q) {
  q = String(q || '').trim().slice(0, 600);
  if (!q || S.doctorBusy) return;
  if (!toolsPaid() && toolLeft('doctor') <= 0) return renderScanView();
  if (looksSensitive(q)) return toast('Please don’t type OTPs, PINs or passwords. Describe the problem without them.', 'bad');
  doctorAI = doctorAI || (AI_HELPER.enabled ? makeServerAI(PAY_API, 'doctor') : null);
  S.doctor = [...(S.doctor || []), { q }]; S.doctorBusy = true; renderScanView();
  const turn = S.doctor[S.doctor.length - 1];
  try {
    if (!doctorAI) throw new Error('off');
    const history = S.doctor.slice(0, -1).flatMap((m) => (m.a ? [{ role: 'user', text: m.q }, { role: 'model', text: m.a }] : [])).concat([{ role: 'user', text: q }]);
    turn.a = await doctorAI(q, history);
    toolSpend('doctor');
  } catch (e) {
    turn.err = e?.message === 'limit' ? 'The Phone Doctor is busy right now. Try again in a little while.' : e?.message === 'network' ? 'Couldn’t reach Verth. Check your internet and try again.' : 'The Phone Doctor isn’t available right now. Meanwhile, go through the check-up list above, and if you shared an OTP or installed an app from a link, call your bank and 1930 now.';
  }
  S.doctorBusy = false; renderScanView();
  document.querySelector('#doctor .doc-chat > :last-child')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// People who haven't joined or made a circle yet still get the whole app: Scan and the safety
// check-up work straight away, and Verify, Chat and Circle explain what a circle adds and set one up.
function setupCircleCard(title, text) {
  return `<section class="card setup-card"><h2>${title}</h2><p class="muted">${text}</p>
    <div class="setup-opts">
      <button class="setup-opt" data-act="setup" data-type="family">${ICON.people}<b>Family circle</b><span>Parents, children, relatives</span></button>
      <button class="setup-opt" data-act="setup" data-type="org">${ICON.check}<b>Organisation</b><span>Your company or team</span></button>
      <button class="setup-opt" data-act="setup" data-type="join">${ICON.share}<b>I have an invite code</b><span>Join someone’s circle</span></button>
    </div></section>`;
}
function renderScanOnly() {
  S.scanOnly = true; stopListeners(); S.circle = null; S.circleId = null;
  if (S.profileOpen) { S.soloTab = 'profile'; S.profileOpen = false; }
  if (S.guardOpen) { S.soloTab = 'guard'; S.guardOpen = false; }
  const tab = S.soloTab || 'home';
  const interest = S.profile?.upgradeInterest?.plan;
  const personal = S.profile?.plan === 'personal' ? billingCard(S.profile.billing, 'user') : `<section class="card"><h2>Unlimited scam and photo checks</h2><p class="muted">Personal plan, ₹149 a month.${PAY_API ? ' Pay with UPI or card through Razorpay. Cancel any time.' : ' Paid plans open with online payment soon; you won’t be charged now.'}</p>
        ${PAY_API ? payButton('personal', 'Get Personal · ₹149 / month') : interest === 'personal' ? '<span class="pill wait">We’ll notify you</span>' : '<button class="btn primary" data-act="upgrade" data-plan="personal">Notify me when it opens</button>'}</section>`;
  const pending = S.pending.length ? `<div class="banner"><span>Waiting for approval to join ${S.pending.map((p) => esc(p.name)).join(', ')}.</span></div>` : '';
  const views = {
    home: () => `${inTrial() ? videoCard('intro') : ''}${heroBanner(esc, { name: S.profile?.name || S.user.displayName, scanOnly: true })}${pending}
      ${quoteCarousel()}
      <div class="sec-hd plain"><span class="eyebrow">Quick actions</span><h2>What would you like to do?</h2></div>
      ${quickTiles([
        ['scan-kind', 'Check a message', 'SMS, WhatsApp or email', 'sms', 'data-kind="message"', 'violet'],
        ['scan-kind', 'Check a screenshot', 'Photo or QR code', 'camera', 'data-kind="image"', 'teal'],
        ['scan-kind', 'Check a phone number', 'Who is calling?', 'ask', 'data-kind="phone"', 'amber'],
        ['scan-kind', 'Check a link', 'Before you tap it', 'code', 'data-kind="link"', 'red'],
      ])}
      ${guardCard()}
      ${setupCircleCard('Protect your family or team', 'Set up a circle to check money requests with the real person, on their own phone, before anyone pays or shares anything. It also opens private chat and Pay safely.')}
      ${alertShow()}${rulesGrid()}${helplineBand()}${signOff()}`,
    scan: () => `${pageHead('Scam check', 'Is it real or a scam?', 'Check a message, job offer, link, number or screenshot in seconds.', 'scan', 'violet')}${videoCard('scan')}${viewScan()}`,
    verify: () => `${pageHead('Verify', 'Is it really them?', 'Ask the real person on their own phone, or check the code they read out.', 'shield', 'amber')}${videoCard('verify')}
      ${setupCircleCard('Verify works with your circle', 'When a message “from your boss” or “from your son” asks for money, Verth asks the real person on their own phone. Add them to a circle first, then checks take one tap.')}`,
    chat: () => `${pageHead('Private chat', 'Talk privately', 'Messages, documents and payments between two people. Locked to your two phones.', 'sms', 'teal')}${videoCard('chat')}
      ${setupCircleCard('Chat with people in your circle', 'Private, end-to-end encrypted chat, files like certificates, and Pay safely with receipts. Start a circle or join one to begin.')}`,
    circle: () => `${pageHead('Your circle', 'Your people', 'The family or colleagues you check money requests with.', 'family', 'teal')}${videoCard('circle')}${pending}
      ${setupCircleCard('You’re not in a circle yet', 'Make a family circle, set up your organisation, or join with an invite code someone sent you. Nobody gets in without approval.')}`,
    plan: () => `${pageHead('Plan & account', 'Plans and billing', 'Your plan, your free trial and this device.', 'key', 'amber')}${videoCard('plan')}${personal}
      <section class="card"><h2>Family and Team plans</h2><p class="muted">Family (₹199 a month, up to 10 people) and Team (₹299 a month, no limit) protect everyone in a circle. Set up a circle to choose one.</p>
        <div class="row gap"><button class="btn ghost grow" data-act="setup" data-type="family">Family circle</button><button class="btn ghost grow" data-act="setup" data-type="org">Organisation</button></div></section>
      ${accountCard()}`,
    guard: () => `${videoCard('guard')}${viewGuard(guardOpts())}`,
    profile: () => viewProfile(),
  };
  paint(`<div class="app solo">
    <header class="top">${brand}<div class="circle-pick"><b>${esc(String(S.profile?.name || S.user.displayName || 'My Verth').split(/\s+/)[0])}’s Verth</b><span class="tag">${esc(S.user.email)}</span></div>${headAvatar()}</header>
    <main class="content">
      ${trialBanner()}
      ${(views[tab] || views.home)()}
    </main>
    <nav class="tabs" aria-label="Sections">${TABS.map(([id, label, ic]) => `<button class="${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">${ic}<span>${label}</span></button>`).join('')}
      ${[['guard', 'Safety check-up', ICON.shield], ['profile', 'My profile', ICON.user]].map(([id, label, ic]) => `<button class="xtra ${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${ic}<span>${label}</span></button>`).join('')}
    </nav>${rail()}</div>`);
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
      ${checkLimit() === Infinity ? 'Unlimited checks.' : `${used} of ${checkLimit()} checks used this month.`} ${cp === 'team' ? `${count} people, no limit.` : `${count} of ${memberLimit()} places used.`}</p></section>
    ${circlePaid() && S.circle.billing ? billingCard(S.circle.billing, 'circle') : ''}
    ${personal && S.profile.billing ? billingCard(S.profile.billing, 'user') : ''}
    ${inTrial() && !(S.profile?.plan && S.profile.plan !== 'free') && !circlePaid() ? `<section class="card trial-card"><h2>✨ Free trial</h2><p>Everything is unlimited for <b>${trialDaysLeft() <= 1 ? 'today only' : `${trialDaysLeft()} more days`}</b> (until ${new Date(trialEnd()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}). After that you’re on the Free plan, unless you choose a plan below. Nothing is charged automatically.</p></section>` : ''}
    <section class="card"><h2>Scam checks</h2><p>${scanLimit() === Infinity ? 'Unlimited scam checks.' : `${Math.min(S.scanUsed ?? 0, scanLimit())} of ${scanLimit()} free scam checks used today. They reset at midnight (India time).`}</p>
      <p>${photoLimit() === Infinity ? 'Unlimited photo and screenshot checks.' : `${Math.min(S.photoUsed ?? 0, photoLimit())} of ${photoLimit()} free photo checks used. Paid plans make them unlimited.`}</p></section>
    <div class="plans">
      ${card('free', 'Free', '₹0', ['Up to 5 people', '20 verification checks a month', '2 scam checks a day', '5 free photo checks', '12 private messages and 3 Pay safely payments a day', 'Daily phone check-up, 1 App X-ray and 3 Phone Doctor questions a day', 'Signed push checks and rolling codes'])}
      ${card('personal', 'Personal', '₹149 <small>/ month</small>', ['Unlimited scam checks for you', 'Unlimited photo and screenshot checks', 'Unlimited App X-ray and AI Phone Doctor', 'Unlimited private chat and Pay safely for you', 'Everything in Free'])}
      ${card('family', 'Family', '₹199 <small>/ month</small>', ['Up to 10 people', 'Unlimited checks', 'Unlimited scam and photo checks for everyone', 'Family phone-safety board: see everyone’s daily score', 'Unlimited App X-ray and AI Phone Doctor for everyone', 'Unlimited private chat and Pay safely', 'Log export'])}
      ${card('team', 'Team', '₹299 <small>/ month</small>', ['Your whole organisation: no limit on people', 'Unlimited checks, scam and photo checks', 'Unlimited private chat and Pay safely', 'Log export for auditors', 'Staff phone-safety board', 'Admin controls: company email lock, staff list, two-admin approval', 'Faster email support: reply within 1 working day', 'Everything in every plan'])}
    </div>
    <p class="muted small">${live ? 'Pay monthly with UPI Autopay or a card, through Razorpay. Verth never sees your card or UPI PIN. Cancel any time and keep the plan until the end of the month you paid for. <a href="terms.html" target="_blank" rel="noopener">Terms</a> · <a href="refunds.html" target="_blank" rel="noopener">Refunds</a>' : 'Paid plans open with online payment shortly. Choose one to be notified first; you won’t be charged now.'}</p>
    <section class="card"><div class="split"><h2>Your account</h2><button class="btn small" data-act="profile-open">Open profile</button></div><p class="muted small">Your photo, history, fingerprint login, sign out and account settings are in your profile.</p></section>`;
}

/* ---------- account: fingerprint / face login, sign out, delete ---------- */
const activeBilling = (b) => !!b && ['active', 'authenticated', 'pending'].includes(b.status) && !b.cancelAtEnd;
// Subscriptions this person pays for and that will renew.
function mySubscriptions() {
  const out = [];
  if (S.profile?.plan === 'personal' && activeBilling(S.profile.billing)) out.push({ target: 'user', name: 'Personal', price: PLANS.personal.price });
  for (const c of Object.values(S.circles || {})) {
    const b = (c.id === S.circleId && S.circle ? S.circle : c).billing;
    if (b?.payerUid === S.user?.uid && activeBilling(b)) out.push({ target: 'circle', id: c.id, name: `${PLANS[c.plan]?.name || 'Paid'} for ${c.name}`, price: PLANS[c.plan]?.price || '' });
  }
  return out;
}
// Forget everything Verth kept on this device about the person (used after deleting an account).
function wipeDevice() {
  try {
    for (const k of Object.keys(localStorage)) if (/^verth-/.test(k) && k !== 'verth-vlang') localStorage.removeItem(k);
    for (const k of Object.keys(sessionStorage)) if (/^verth-/.test(k) && k !== 'verth-splash') sessionStorage.removeItem(k);
  } catch {}
}
async function doSignout() { store.set('verth-me', null); try { localStorage.removeItem('verth-photo'); } catch {} stopListeners(); pendingWatch.forEach((u) => u()); pendingWatch = []; S.seen.clear(); S.passkeys = null; S.confirmDelete = false; S.authMode = 'login'; await signOut(auth); }
function openSignout() {
  closeSignout();
  const subs = mySubscriptions();
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'signout-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'so-title');
  m.innerHTML = `<div class="modal-card"><h2 id="so-title">Before you sign out</h2>
    <p>You have ${subs.length > 1 ? 'these subscriptions' : 'a subscription'} that will renew:</p>
    <ul class="so-list">${subs.map((x) => `<li><b>${esc(x.name)}</b> <span class="muted">${esc(x.price)}</span></li>`).join('')}</ul>
    <p class="muted small">Do you also want to cancel ${subs.length > 1 ? 'them' : 'it'}? If you cancel, you keep everything until the end of the month you paid for, and you won’t be charged again.</p>
    <div class="stack"><button class="btn primary" data-act="signout-just">Just sign out (keep my plan)</button>
    <button class="btn bad" data-act="signout-cancel">Sign out and cancel my subscription</button>
    <button class="btn ghost" data-act="signout-no">Stay signed in</button></div></div>`;
  m.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); } else if (e.target === m) closeSignout(); });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSignout(); });
  document.body.appendChild(m);
  m.querySelector('button')?.focus();
}
function closeSignout() { document.getElementById('signout-modal')?.remove(); }
const rerender = () => (S.circle && !S.scanOnly ? renderMain() : renderScanOnly());

function ensurePasskeys() {
  if (S.passkeys || S.pkLoading || !PAY_API || !passkeySupported()) return;
  S.pkLoading = true;
  payApi('/passkey/list', {}).then((j) => { S.passkeys = j.keys || []; }).catch(() => { S.passkeys = []; })
    .finally(() => { S.pkLoading = false; if (document.getElementById('pk-box')) rerender(); });
}
function accountCard() {
  ensurePasskeys();
  const pk = passkeySupported();
  const keys = S.passkeys || [];
  return `<section class="card"><h2>Account and device</h2>
    <p class="muted">${esc(S.user.email)}${S.profile?.phone ? ` · ${esc(S.profile.phone)}` : ''}${phoneOk() ? ' <span class="ok-inline inline">✓ verified</span>' : ''}</p>
    <div class="lock-row"><span class="lr-ic">${ICON.lock}</span><span class="grow"><b>App lock</b><span class="muted small">${appLockOn() ? 'On: Verth asks for your fingerprint or face each time it opens, and after 5 minutes in the background.' : 'Off. Turn it on to lock Verth with your fingerprint or face.'}</span></span>
      <button class="switch ${appLockOn() ? 'on' : ''}" role="switch" aria-checked="${appLockOn()}" aria-label="App lock" data-act="applock-toggle"><i></i></button></div>
    ${S.smsOn && smsApplies() && !phoneOk() ? '<div class="banner accent"><span><b>Verify your mobile number</b> so your circle knows it’s really you.</span><button class="btn small" data-act="verify-mobile">Verify now</button></div>' : ''}
    <p class="muted small">This device: ${esc(deviceLabel())}${S.circle ? (thisDeviceActive() ? ' · registered' : ' · not registered') : ''}</p>
    <div class="pk-box" id="pk-box"><div class="pk-hd">${ICON.finger}<div><b>Fingerprint / face login</b><span class="muted small">Log in without typing your email. Your fingerprint or face never leaves your device.</span></div></div>
      ${!pk || !PAY_API ? `<p class="muted small">${pk ? 'Fingerprint / face login isn’t available right now.' : 'This browser can’t do fingerprint / face login. Try Chrome, Safari or Edge on your phone.'}</p>`
        : S.passkeys === null || S.passkeys === undefined ? '<p class="muted small">Checking…</p>'
        : `${keys.length ? `<ul class="list pk-list">${keys.map((k) => `<li><span class="grow"><b>${esc(k.label)}</b><span class="muted small">Turned on ${k.createdAt ? fmtDate(k.createdAt) : ''}</span></span><button class="btn small ghost" data-act="pk-remove" data-id="${esc(k.id)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted small">Not turned on yet.</p>'}
          <button class="btn ghost" data-act="pk-add">${keys.length ? 'Add this device too' : 'Turn on for this device'}</button>`}
    </div>
    <button class="btn ghost" data-act="signout">Sign out</button>
    ${S.confirmDelete ? `<div class="danger-box" id="delete-box"><b>Delete your Verth account?</b>
      <p class="small">This stops any subscription you pay for (you won’t be charged again), removes you from circles where you’re a member, turns off fingerprint / face login and deletes your account. Entries you made in a circle’s verification log stay there for that circle’s records. This can’t be undone.</p>
      <form data-form="delete-account" class="stack" novalidate><label>Type <b>DELETE</b> to confirm<input id="d-confirm" autocomplete="off" maxlength="10" data-keep="no"></label>
      <p class="err" id="d-err" role="alert"></p>
      <div class="row gap"><button class="btn bad grow" type="submit">Delete my account</button><button class="btn ghost grow" type="button" data-act="delete-no">Keep my account</button></div></form></div>`
      : '<button class="link danger-link" data-act="delete-ask">Delete my account</button>'}
  </section>`;
}

/* ---------- payments (Razorpay, through the Verth payments worker) ---------- */
async function payApi(path, body) {
  const token = await S.user.getIdToken();
  let r;
  try {
    r = await fetch(PAY_API.replace(/\/+$/, '') + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  } catch { throw new Error('Couldn’t reach Verth’s server. Check your internet and try again.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Verth’s server had a problem. Try again in a minute.'), { status: r.status });
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
function stopListeners() { S.unsubs.forEach((u) => u()); S.unsubs = []; S.chatUnsub?.(); S.chatUnsub = null; S.chatWith = null; }

async function openCircle(cid) {
  stopListeners();
  Object.assign(S, { circleId: cid, circle: S.circles[cid] || null, members: [], checks: [], lastSentId: null, codeResult: null, confirmYes: null, confirmRemove: null, allow: null, allowSub: false, contacts: {}, chats: {}, daily: null, payHist: null, payAwait: null });
  closeChat();
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
    if (isAdmin() && !S.allowSub) { // the staff list is only readable by admins
      S.allowSub = true;
      S.unsubs.push(onSnapshot(collection(db, 'circles', cid, 'allow'), (a) => {
        S.allow = a.docs.map((d) => ({ email: d.id, ...d.data() })).sort((x, y) => x.email.localeCompare(y.email));
        renderMain();
      }, () => { S.allow = []; }));
      S.unsubs.push(onSnapshot(collection(db, 'circles', cid, 'contacts'), (a) => {
        S.contacts = Object.fromEntries(a.docs.map((d) => [d.id, d.data().phone]));
        S.contactsV = new Set(a.docs.filter((d) => d.data().v === true).map((d) => d.id));
        renderMain();
      }, () => {}));
    }
    renderMain(); verifySigs();
  }, () => {}));
  watchChats(cid);
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

// Remembered on this device so the home page and Log in can greet the person by name.
// 'verth-me' = signed in right now; 'verth-last' = who last used Verth here (kept after signing out,
// removed when the account is deleted or they tap "Not you?").
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
function remember(name, email) { const first = String(name || '').trim(); store.set('verth-me', { name: first }); store.set('verth-last', { ...(store.get('verth-last') || {}), name: first, email }); }

async function createProfile({ name, phone, gender, dob, country }) {
  const u = S.user;
  if (u.displayName !== name) { try { await updateProfile(u, { displayName: name }); } catch {} }
  const base = { name: name.slice(0, 60), email: u.email, phone, plan: 'free', circles: [], activeCircle: null, onboarded: false, agreedAt: serverTimestamp(), createdAt: serverTimestamp() };
  try { await setDoc(doc(db, 'users', u.uid), { ...base, gender, dob, country }); }
  catch (e) {
    // The database's security rules may not have the newest fields yet (they're published by hand).
    // Create the account without them rather than block sign-up.
    if (e?.code !== 'permission-denied') throw e;
    await setDoc(doc(db, 'users', u.uid), base);
  }
}
// One welcome email from Umesh per new account (the server makes sure it's only sent once).
function welcomeEmail() { if (PAY_API) payApi('/account/welcome', { name: S.profile?.name || '' }).catch(() => {}); }

async function afterSignIn(preferId) {
  const u = S.user;
  const ref = doc(db, 'users', u.uid);
  let s = await getDoc(ref);
  let isNew = false;
  if (!s.exists()) {
    // "Log in with Google" by someone who never created a Verth account: undo and send them to Create account.
    if (S.authFlow === 'google-login') {
      S.authFlow = '';
      try { await deleteUser(u); } catch { await signOut(auth); }
      S.authMode = 'signup';
      return renderAuth('There’s no Verth account for that Google account yet. Create one below, it takes a minute.');
    }
    const info = S.signupInfo;
    if (!info?.name || !info?.phone || !info?.dob) return renderCompleteProfile();
    await createProfile(info);
    s = await getDoc(ref); isNew = true;
  }
  S.authFlow = ''; S.signupInfo = null;
  S.profile = s.data();
  remember(S.profile.name, u.email);
  try { if (photoOf(S.profile)) localStorage.setItem('verth-photo', S.profile.photo); else localStorage.removeItem('verth-photo'); } catch {} // for the home page's "Open my Verth"

  if (isNew) {
    welcomeEmail();
    if ((await smsEnabled()) && smsApplies() && !phoneOk()) return startPhone('signup');
    return afterPhone();
  }
  S.keys = await deviceKeys(u.uid);
  const [smsOn] = await Promise.all([smsEnabled(), loadCircles(), loadUsage(), loadPhotoUsage()]);
  // Strong sign-up: once mobile checks are switched on, everyone verifies their number once.
  if (smsOn && smsApplies() && !phoneOk() && !S.smsLater) return startPhone('gate');
  watchPending();
  const ids = Object.keys(S.circles);
  const inv = pendingInvite();
  if (inv) {
    let cid = '';
    try { const d = await getDoc(doc(db, 'invites', inv)); cid = d.exists() ? d.data().circleId : ''; } catch {}
    if (cid && (S.profile.circles || []).includes(cid)) clearInvite();
    else { renderSetup('join', inv); return; }
  }
  const wantScan = takeShared();
  if (wantScan) S.tab = 'scan';
  if (!ids.length) {
    if (wantScan) { S.soloTab = 'scan'; return renderScanOnly(); }
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
const setErrHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
// Catches common slips like "gmial.com" before a code is sent to the wrong inbox.
const MAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'rediffmail.com', 'protonmail.com', 'proton.me', 'zoho.com', 'aol.com'];
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function emailTypo(email) {
  const [user, dom] = email.toLowerCase().split('@');
  if (!dom || MAIL_DOMAINS.includes(dom)) return '';
  let best = '', bd = 3;
  for (const m of MAIL_DOMAINS) { const dd = editDistance(dom, m); if (dd < bd) { bd = dd; best = m; } }
  return best && bd <= 2 ? `${user}@${best}` : '';
}
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'tempmailo.com', 'mohmal.com', 'tempr.email', 'discard.email', 'mailnesia.com'];
const isDisposable = (email) => DISPOSABLE.includes(String(email).toLowerCase().split('@')[1] || '');
const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
const busy = (form, on) => {
  form?.querySelectorAll('button').forEach((b) => (b.disabled = on));
  const main = form?.querySelector('button[type=submit]');
  if (main) { main.classList.toggle('is-loading', on); main.setAttribute('aria-busy', on ? 'true' : 'false'); }
};

const actions = {
  reload: () => location.reload(),
  'otp-change': () => { S.otpEmail = ''; renderAuth(); },
  'invite-contacts': async () => {
    try {
      const list = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      const picked = [];
      for (const c of list || []) for (const tel of (c.tel || []).slice(0, 1)) picked.push({ name: String(c.name?.[0] || '').slice(0, 60), tel: String(tel).slice(0, 20), wa: waNumber(tel) });
      if (!picked.length) return toast('No phone numbers picked.');
      S.picked = picked.slice(0, 30); renderMain();
      document.querySelector('.picked')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) { if (e?.name !== 'AbortError') toast('Couldn’t open your contacts. Use “Share the invite another way”.'); }
  },
  'invite-share': async () => {
    const text = inviteMessage();
    if (navigator.share) { try { await navigator.share({ title: 'Join me on Verth', text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Invite copied. Paste it in WhatsApp or SMS.', 'ok'); } catch { toast('Copy the invite message below and send it.'); }
  },
  sent: (el, e) => { const p = S.picked?.[+el.dataset.i]; if (p) p.sent = true; const href = el.getAttribute('href'); if (href) { e?.preventDefault?.(); window.open(href, href.startsWith('sms:') ? '_self' : '_blank', 'noopener'); setTimeout(renderMain, 300); } },
  'picked-clear': () => { S.picked = null; renderMain(); },
  'not-me': () => { store.set('verth-last', null); store.set('verth-pk', null); renderAuth(); document.getElementById('a-email')?.focus(); },
  'use-email': (el) => { const i = document.getElementById('a-email'); if (i) { i.value = el.dataset.email; setErr('a-err', ''); S.emailOk = el.dataset.email; } },
  'auth-tab': (el) => { S.authMode = el.dataset.mode === 'signup' ? 'signup' : 'login'; renderAuth(); },
  'pk-login': async (el) => {
    el.disabled = true; setErr('a-err', '');
    try {
      const token = await loginWithPasskey(otpApi);
      S.authFlow = 'passkey';
      if (auth.currentUser) await signOut(auth);
      await signInWithCustomToken(auth, token);
    } catch (e) { el.disabled = false; setErr('a-err', e?.otp ? e.message : passkeyError(e)); }
  },
  'welcome-go': () => { S.screen = ''; afterSignIn(); },
  'welcome-pk': async (el) => {
    el.disabled = true; setErr('w-err', '');
    try { await registerPasskey(payApi, deviceLabel()); store.set('verth-pk', 1); toast('Fingerprint / face login is on for this device.', 'ok'); afterSignIn(); }
    catch (e) { el.disabled = false; setErr('w-err', passkeyError(e)); }
  },
  'pk-add': async (el) => {
    el.disabled = true;
    try { await registerPasskey(payApi, deviceLabel()); store.set('verth-pk', 1); toast('Fingerprint / face login is on for this device.', 'ok'); S.passkeys = null; rerender(); }
    catch (e) { el.disabled = false; toast(passkeyError(e)); }
  },
  'pk-remove': async (el) => {
    try { await payApi('/passkey/remove', { id: el.dataset.id }); toast('Removed.'); S.passkeys = null; rerender(); }
    catch (e) { toast(e.message || 'Couldn’t remove it. Try again.'); }
  },
  'delete-ask': () => { S.confirmDelete = true; rerender(); document.getElementById('delete-box')?.scrollIntoView({ block: 'center' }); },
  'delete-no': () => { S.confirmDelete = false; rerender(); },
  'signout-no': () => closeSignout(),
  'signout-just': () => { closeSignout(); doSignout(); },
  'signout-cancel': async (el) => {
    el.disabled = true;
    try {
      for (const sub of mySubscriptions()) await payApi('/cancel', sub.target === 'user' ? { target: 'user' } : { target: 'circle', circleId: sub.id });
      closeSignout(); toast('Subscription cancelled. Renewals have stopped.', 'ok'); doSignout();
    } catch (e) { el.disabled = false; toast(e.message || 'Couldn’t cancel. Try again, or cancel from the Plan tab.'); }
  },
  'otp-resend': async () => {
    try { await sendCode(S.otpEmail); renderCode('We sent a new code. Use the newest email.'); }
    catch (e) { setErr('a-err', friendlyError(e)); }
  },
  google: async () => {
    S.authFlow = S.authMode === 'signup' ? 'google-signup' : 'google-login';
    const gp = new GoogleAuthProvider();
    gp.setCustomParameters({ prompt: 'select_account' }); // always show the account chooser
    setErr('a-err', '');
    try {
      if (auth.currentUser) await signOut(auth); // never mix with an older session on this device
      await signInWithPopup(auth, gp);
    } catch (e) {
      S.authFlow = '';
      const c = e?.code || '';
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request' || c === 'auth/user-cancelled') return;
      setErr('a-err', c === 'auth/popup-blocked' ? 'Your browser blocked the Google window. Allow pop-ups for this site and tap Continue with Google again.' : friendlyError(e));
    }
  },
  // Paid users choose whether signing out also stops their subscription.
  signout: () => { if (mySubscriptions().length) openSignout(); else doSignout(); },
  'tour-next': () => { S.tourStep++; renderTour(); },
  'tour-back': () => { S.tourStep--; renderTour(); },
  'tour-skip': () => { S.tourStep = TOUR.length - 1; renderTour(); },
  'tour-choose': (el) => {
    if (!S.profile.onboarded) { S.profile.onboarded = true; updateDoc(doc(db, 'users', S.user.uid), { onboarded: true }).catch(() => {}); }
    if (el.dataset.type === 'scan') { if (Object.keys(S.circles).length) { S.tab = 'scan'; return afterSignIn(S.circleId); } S.soloTab = 'scan'; return renderScanOnly(); }
    renderSetup(el.dataset.type);
  },
  'scan-only': () => renderScanOnly(),
  'scan-kind': (el) => {
    S.scanKind = el.dataset.kind; S.scanResult = null;
    const jump = S.circle ? S.tab !== 'scan' : (S.soloTab || 'home') !== 'scan';
    if (jump) { if (S.circle) S.tab = 'scan'; else S.soloTab = 'scan'; }
    renderScanView();
    if (jump) window.scrollTo(0, 0); else document.querySelector('.kinds')?.scrollIntoView({ block: S.scanOnly ? 'start' : 'nearest', behavior: 'smooth' });
  },
  'scan-again': () => { S.scanResult = null; clearPhoto(); renderScanView(); window.scrollTo(0, 0); },
  'photo-clear': () => { clearPhoto(); S.scanResult = null; renderScanView(); },
  'open-helper': () => helper?.open(),
  'setup-back': () => (clearInvite(), S.circle ? renderMain() : S.pending.length ? renderPending() : S.profile?.onboarded ? renderScanOnly() : (S.tourStep = TOUR.length - 1, renderTour())),
  setup: (el) => renderSetup(el.dataset.type),
  replay: () => { S.tourStep = 0; renderTour(); },
  tab: (el) => { if (el.dataset.tab === 'guard') setTimeout(guardExtras, 0); if (!S.circle) { S.soloTab = el.dataset.tab; renderScanOnly(); window.scrollTo(0, 0); return; } if (S.chatWith) closeChat(); S.tab = el.dataset.tab; S.confirmRemove = null; renderMain(); window.scrollTo(0, 0); },
  goverify: (el) => { if (!S.circle) { S.soloTab = 'verify'; renderScanOnly(); window.scrollTo(0, 0); return; } S.tab = 'verify'; S.verifyMode = el.dataset.mode; S.codeResult = null; renderMain(); },
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
    const m = member(el.dataset.uid), ref = doc(db, 'circles', S.circleId, 'members', el.dataset.uid);
    if (!m) return;
    try {
      if (S.circle.twoAdmins && !(firstApproval(m) && firstApproval(m).by !== S.user.uid)) {
        await updateDoc(ref, { firstApproval: { by: S.user.uid, n: m.device.n, at: serverTimestamp() } });
        toast('Approved. A second admin needs to approve too.', 'ok');
      } else {
        await updateDoc(ref, { status: 'active', approvedBy: S.user.uid, approvedAt: serverTimestamp() });
        toast('Approved', 'ok');
      }
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'set-role': async (el) => {
    const m = member(el.dataset.uid), v = el.dataset.v === 'admin' ? 'admin' : 'member';
    if (!m) return;
    try { await updateDoc(doc(db, 'circles', S.circleId, 'members', m.uid), { role: v }); toast(v === 'admin' ? `${m.name} is now an admin.` : `${m.name} is no longer an admin.`, 'ok'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'company-lock': async (el) => {
    const on = el.dataset.v === '1', d = on ? companyDomain(S.user.email) : null;
    if (on && !d) return toast('Log in with your work email to turn this on.', 'bad');
    try {
      const b = writeBatch(db);
      b.update(doc(db, 'circles', S.circleId), { domain: d });
      b.update(doc(db, 'invites', S.circle.inviteCode), { domain: d });
      await b.commit();
      toast(on ? `Locked. Only @${d} emails can ask to join.` : 'Company lock turned off.', 'ok');
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'list-only': async (el) => {
    try { await updateDoc(doc(db, 'circles', S.circleId), { listOnly: el.dataset.v === '1' }); toast(el.dataset.v === '1' ? 'Only people on your staff list can ask to join now.' : 'Anyone with the invite code can ask to join again.', 'ok'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'two-admins': async (el) => {
    const on = el.dataset.v === '1';
    if (on && admins().length < 2) return toast('Make a second admin first.', 'bad');
    try { await updateDoc(doc(db, 'circles', S.circleId), { twoAdmins: on }); toast(on ? 'Two-admin approval is on.' : 'Two-admin approval is off.', 'ok'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'allow-remove': async (el) => {
    try { const b = writeBatch(db); b.delete(doc(db, 'circles', S.circleId, 'allow', el.dataset.email)); await b.commit(); }
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
      b.delete(doc(db, 'circles', cid, 'contacts', S.user.uid));
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
      b.set(doc(db, 'invites', code), { circleId: S.circleId, circleName: S.circle.name, type: S.circle.type, ...(S.circle.domain ? { domain: S.circle.domain } : {}), createdBy: S.user.uid, createdAt: serverTimestamp() });
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
    b.delete(doc(db, 'circles', S.circleId, 'contacts', uid));
    b.update(doc(db, 'circles', S.circleId), { memberCount: increment(-1), lastRemoved: uid });
    await b.commit();
    S.confirmRemove = null; toast(word); renderMain();
  } catch (e) { toast(friendlyError(e), 'bad'); }
}

const forms = {
  doctor: (f) => { const t = f.querySelector('#doc-q'); const q = t?.value || ''; if (!q.trim()) { t?.focus(); return; } if (!looksSensitive(q)) t.value = ''; askDoctor(q); },
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
    logScan(r, text);
    S.scanResult = r;
    renderScanView();
    document.getElementById('scan-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadReportCount(r);
  },
  'otp-email': async (f) => {
    const email = f.querySelector('#a-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('a-err', 'That email address doesn’t look right.');
    if (needCaptcha()) return setErr('a-err', (robotTicked() ? 'One moment: we’re still checking you’re not a robot. Then tap again.' : 'Please tick “I’m not a robot” first.'));
    busy(f, true); setErr('a-err', '');
    try { S.authMode = 'login'; await sendCode(email); renderCode(); }
    catch (e) {
      // That account doesn't exist (any more): stop greeting it on this device.
      const last = store.get('verth-last');
      if (/No Verth account uses this email/i.test(e?.message || '') && last && String(last.email || '').toLowerCase() === email.toLowerCase()) {
        store.set('verth-last', null); store.set('verth-pk', null);
        renderAuth(); const em = document.getElementById('a-email'); if (em) em.value = email;
      }
      setErr('a-err', captchaHint(friendlyError(e))); busy(f, false); resetCaptcha();
    }
  },
  signup: async (f) => {
    const name = f.querySelector('#a-name').value.trim().replace(/\s+/g, ' '), email = f.querySelector('#a-email').value.trim();
    const who = readPerson(f, 'a');
    if (name.length < 2) return setErr('a-err', 'Please type your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('a-err', 'That email address doesn’t look right.');
    if (isDisposable(email)) return setErr('a-err', 'Please use your own email address. Temporary email addresses can’t be used for a Verth account.');
    const fix = emailTypo(email);
    if (fix && S.emailOk !== email) { S.emailOk = email; return setErrHtml('a-err', `Did you mean <button type="button" class="link" data-act="use-email" data-email="${esc(fix)}">${esc(fix)}</button>? If your email is right, tap “Send verification code” again.`); }
    if (who.error) return setErr('a-err', who.error);
    if (needCaptcha()) return setErr('a-err', (robotTicked() ? 'One moment: we’re still checking you’re not a robot. Then tap again.' : 'Please tick “I’m not a robot” first.'));
    if (!f.querySelector('#a-agree').checked) return setErr('a-err', 'Please tick the box to agree to the Terms and Privacy policy.');
    busy(f, true); setErr('a-err', '');
    try { S.authMode = 'signup'; S.signupInfo = { name: name.slice(0, 60), ...who }; await sendCode(email, { name: name.slice(0, 60) }); renderCode(); }
    catch (e) { setErr('a-err', captchaHint(friendlyError(e))); busy(f, false); resetCaptcha(); }
  },
  'complete-profile': async (f) => {
    const name = f.querySelector('#n-name').value.trim().replace(/\s+/g, ' ');
    const who = readPerson(f, 'n');
    if (name.length < 2) return setErr('n-err', 'Please type your full name.');
    if (who.error) return setErr('n-err', who.error);
    if (!f.querySelector('#n-agree').checked) return setErr('n-err', 'Please tick the box to agree to the Terms and Privacy policy.');
    busy(f, true);
    try { S.signupInfo = { name: name.slice(0, 60), ...who }; await afterSignIn(); }
    catch (e) { setErr('n-err', friendlyError(e)); busy(f, false); }
  },
  'delete-account': async (f) => {
    if (f.querySelector('#d-confirm').value.trim() !== 'DELETE') return setErr('d-err', 'Type DELETE in capital letters to confirm.');
    busy(f, true); setErr('d-err', '');
    try {
      await payApi('/account/delete', { confirm: 'DELETE' });
      S.confirmDelete = false;
      await doSignout();
      wipeDevice(); // after signing out, so nothing writes the name back
      S.authMode = 'login'; renderAuth('Your account has been deleted, and any subscription you paid for will not renew. Thank you for using Verth.');
    } catch (e) { setErr('d-err', e.message || 'Couldn’t delete the account. Try again.'); busy(f, false); }
  },
  'otp-code': async (f) => {
    const code = f.querySelector('#a-code').value.replace(/\D/g, '');
    if (code.length !== 6) return setErr('a-err', 'Enter all 6 digits from the email.');
    busy(f, true); setErr('a-err', '');
    try {
      const { token } = await otpApi('/otp/verify', { email: S.otpEmail, code });
      S.authFlow = 'code';
      if (auth.currentUser) await signOut(auth);
      await signInWithCustomToken(auth, token);
    } catch (e) {
      setErr('a-err', friendlyError(e)); busy(f, false);
      const input = f.querySelector('#a-code'); input.value = ''; input.focus();
    }
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
      if (myPhone()) b.set(doc(db, 'circles', cref.id, 'contacts', uid), { phone: myPhone(), ...(phoneOk() ? { v: true } : {}) });
      b.update(doc(db, 'users', uid), { circles: arrayUnion(cref.id), activeCircle: cref.id, onboarded: true });
      await b.commit();
      S.profile.circles = [...(S.profile.circles || []), cref.id];
      S.tab = 'circle';
      toast('Circle created. Now invite people.', 'ok');
      await afterSignIn(cref.id);
    } catch (e) { setErr('s-err', friendlyError(e)); busy(f, false); }
  },
  'allow-add': async (f) => {
    const raw = f.querySelector('#al-list').value, have = new Set((S.allow || []).map((a) => a.email)), lockD = S.circle.domain;
    const add = new Map(), wrong = [];
    for (const line of raw.split(/[\n;]+/)) {
      const m = line.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/);
      if (!m) continue;
      const email = m[0].toLowerCase();
      if (lockD && domainOf(email) !== lockD) { wrong.push(email); continue; }
      if (have.has(email) || email.length > 120) continue;
      const name = line.replace(m[0], '').replace(/[<>"'\t,;|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      add.set(email, name);
    }
    if (!add.size) return setErr('al-err', wrong.length ? `Those emails aren’t @${lockD} addresses, so they couldn’t join anyway.` : 'No new email addresses found. Put one per line, like “Priya Nair, priya@company.in”.');
    if (add.size + have.size > 2000) return setErr('al-err', 'The staff list can hold up to 2,000 people.');
    busy(f, true); setErr('al-err', '');
    try {
      const items = [...add];
      for (let i = 0; i < items.length; i += 400) {
        const b = writeBatch(db);
        for (const [email, name] of items.slice(i, i + 400)) b.set(doc(db, 'circles', S.circleId, 'allow', email), { ...(name ? { name } : {}), by: S.user.uid, at: serverTimestamp() });
        await b.commit();
      }
      f.querySelector('#al-list').value = '';
      toast(`Added ${add.size} ${add.size === 1 ? 'person' : 'people'} to the staff list.${wrong.length ? ` Skipped ${wrong.length} that aren’t @${lockD}.` : ''}`, 'ok');
    } catch (e) { setErr('al-err', friendlyError(e)); }
    busy(f, false);
  },
  join: async (f) => {
    const code = f.querySelector('#j-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), title = f.querySelector('#j-title').value.trim();
    if (!/^[A-HJKMNP-Z2-9]{8}$/.test(code)) return setErr('s-err', 'Invite codes have 8 letters and numbers, like ABCD-2345.');
    if (!title) return setErr('s-err', 'Tell your circle who you are, like “Accounts” or “Son”.');
    busy(f, true);
    try {
      const inv = await getDoc(doc(db, 'invites', code));
      if (!inv.exists()) { setErr('s-err', 'That code doesn’t match any circle. Check it with the person who shared it.'); return busy(f, false); }
      const cid = inv.data().circleId, uid = S.user.uid, lockD = inv.data().domain;
      if ((S.profile.circles || []).includes(cid)) { await afterSignIn(cid); return; }
      if (lockD && domainOf(S.user.email) !== lockD) { setErr('s-err', `${inv.data().circleName} only accepts work emails ending in @${lockD}. You’re logged in as ${S.user.email}. Log out and create an account with your @${lockD} email, then use this code again.`); return busy(f, false); }
      const b = writeBatch(db);
      b.set(doc(db, 'circles', cid, 'members', uid), { uid, name: S.profile.name, title: title.slice(0, 40), email: S.user.email, role: 'member', status: 'pending', device: newDeviceRecord(1), inviteCode: code, joinedAt: serverTimestamp() });
      if (myPhone()) b.set(doc(db, 'circles', cid, 'contacts', uid), { phone: myPhone(), ...(phoneOk() ? { v: true } : {}) });
      b.update(doc(db, 'circles', cid), { memberCount: increment(1) });
      b.update(doc(db, 'users', uid), { circles: arrayUnion(cid), onboarded: true });
      await b.commit();
      S.profile.circles = [...(S.profile.circles || []), cid];
      clearInvite();
      toast(`Request sent to ${inv.data().circleName}. Waiting for approval.`, 'ok');
      await afterSignIn();
    } catch (e) {
      setErr('s-err', e?.code === 'permission-denied' ? 'Couldn’t join. The circle may be full, closed to new members, only open to people on its staff list, or the code was changed. Ask the admin.' : friendlyError(e));
      busy(f, false);
    }
  },
  push: async (f) => {
    const toUid = f.querySelector('#v-who').value, what = f.querySelector('#v-what').value.trim(), channel = f.querySelector('#v-channel').value;
    if (!what) return setErr('v-err', 'Describe what they’re asking for, so the other person knows what to confirm.');
    if (!CHANNELS.includes(channel) || !member(toUid)) return setErr('v-err', 'Pick who it’s from and where it came from.');
    const lim = checkLimit();
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

/* ---------- private chat & Pay safely ---------- */
// One-to-one, end-to-end encrypted chat between two members of a circle. Other members, admins
// and Verth only ever see who wrote to whom and when. Pay safely hands a payment to the person's
// own UPI app, filled in with the UPI ID the payee set from their own account.
const CHAT_FREE = 12, PAY_FREE = 3, FILE_MAX = 2 * 1024 * 1024, PART = 512 * 1024;
const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);
const pairId = (uid) => pairOf(S.user.uid, uid).join('~');
const unlimitedTalk = () => (S.profile?.plan && S.profile.plan !== 'free') || circlePaid() || inTrial();
const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,30}$/;
/* ---------- the bank name behind a UPI ID ---------- */
// Asked from the Verth server (Razorpay's UPI ID check), so people see whose bank account an ID
// really pays into. Results are kept for this visit only.
S.upiNames = {};
const nameWords = (n) => String(n || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
// Does the bank name look like the person's name in Verth? (any word in common, or matching initials)
const namesMatch = (bank, mine) => { const a = nameWords(bank), b = nameWords(mine); return !b.length || a.some((w) => b.includes(w)) || (a[0]?.[0] === b[0]?.[0] && a.at(-1)?.[0] === b.at(-1)?.[0]); };
function upiNameLine(vpa, expect) {
  const r = vpa && S.upiNames[vpa];
  if (!vpa || !r) { if (vpa && UPI_RE.test(vpa) && PAY_API) lookUpi(vpa); return ''; }
  if (r === 'busy') return '<span class="muted small">Checking the bank name…</span>';
  if (r.available === false) return '';
  if (!r.valid) return `<span class="warn-inline small">No bank account was found for this UPI ID. Check for typos.</span>`;
  const ok = !expect || namesMatch(r.name, expect);
  return `<span class="un-badge ${ok ? 'ok' : 'warn'}">${ok ? ICON.check : '⚠️'}<span><small>Name at the bank</small><b>${esc(r.name)}</b></span></span>${ok ? '' : `<span class="warn-inline small">This doesn’t look like ${esc(expect)}’s name. Call ${esc(String(expect).split(/\s+/)[0])} before you pay.</span>`}`;
}
async function lookUpi(vpa) {
  if (S.upiNames[vpa] || !S.user) return;
  S.upiNames[vpa] = 'busy';
  try { S.upiNames[vpa] = await payApi('/upi/name', { vpa }); }
  catch { S.upiNames[vpa] = { available: false }; }
  for (const el of document.querySelectorAll('.upi-name')) {
    const input = el.id === 'u-name' ? document.getElementById('u-upi') : null;
    if (el.id === 'pay-name' || (input && input.value.trim().toLowerCase() === vpa)) el.innerHTML = el.id === 'u-name' ? upiNameLine(vpa) : upiNameLine(vpa, S.payWho);
  }
}
// While typing a UPI ID, show the bank name once it looks complete.
let upiTimer = 0;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el?.dataset?.upiLook) return;
  clearTimeout(upiTimer);
  const out = document.getElementById(el.dataset.upiLook), v = el.value.trim().toLowerCase();
  if (out) out.innerHTML = '';
  if (UPI_RE.test(v)) upiTimer = setTimeout(() => { if (out) out.innerHTML = upiNameLine(v) || (S.upiNames[v] === 'busy' ? '<span class="muted small">Checking the bank name…</span>' : ''); }, 600);
});
const isPhone = () => /Android|iPhone|iPad/i.test(navigator.userAgent);
const VIEWABLE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const readKey = (pid) => `verth-read:${S.circleId}:${pid}`;
const lastRead = (pid) => +(store.get(readKey(pid)) || 0);
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const talkable = () => active().filter((m) => m.uid !== S.user.uid);

function chatAad(pid, mid, from, kind) { return [S.circleId, pid, mid, from, kind].join('|'); }
async function keyFor(uid) {
  const o = member(uid);
  if (!S.keys || !o?.device?.dh || !thisDeviceActive()) return null;
  const [a] = pairOf(S.user.uid, uid);
  const k = await chatKey(S.keys, o.device.dh, S.circleId, ...pairOf(S.user.uid, uid));
  const kf = a === S.user.uid ? chatKeyId(S.keys.pub.dh, o.device.dh) : chatKeyId(o.device.dh, S.keys.pub.dh);
  return { k, kf };
}

// Daily allowance (free plan): counted in the same write as the message.
async function loadDaily(kind) {
  const day = todayKey(), id = `${kind}-${day}`;
  if (S.daily?.[kind]?.day === day) return S.daily[kind].count;
  let count = 0;
  try { const s = await getDoc(doc(db, 'users', S.user.uid, 'daily', id)); count = s.exists() ? s.data().count : 0; } catch {}
  S.daily = { ...(S.daily || {}), [kind]: { day, count } };
  return count;
}
function meterOp(b, kind) {
  const day = todayKey(), cur = S.daily?.[kind]?.day === day ? S.daily[kind].count : 0;
  const ref = doc(db, 'users', S.user.uid, 'daily', `${kind}-${day}`);
  const via = circlePaid() && S.profile?.plan === 'free' ? { via: S.circleId } : {};
  if (!cur) b.set(ref, { count: 1, at: serverTimestamp(), ...via });
  else b.update(ref, { count: increment(1), at: serverTimestamp(), ...via });
  return () => { S.daily[kind] = { day, count: cur + 1 }; };
}
const leftToday = (kind) => {
  if (unlimitedTalk()) return Infinity;
  const d = S.daily?.[kind];
  return (kind === 'pay' ? PAY_FREE : CHAT_FREE) - (d && d.day === todayKey() ? d.count : 0);
};

// Conversation list: live, so new messages show up anywhere in the app.
function watchChats(cid) {
  S.chats = {};
  let first = true;
  S.unsubs.push(onSnapshot(query(collection(db, 'circles', cid, 'chats'), where('members', 'array-contains', S.user.uid)), (s) => {
    const prev = S.chats; S.chats = {};
    for (const d of s.docs) S.chats[d.id] = d.data({ serverTimestamps: 'estimate' });
    if (!first) {
      for (const [pid, c] of Object.entries(S.chats)) {
        const was = prev[pid];
        if (c.lastFrom !== S.user.uid && tsMs(c.lastAt) > tsMs(was?.lastAt || 0) && !(S.tab === 'chat' && S.chatWith && pairId(S.chatWith) === pid && !document.hidden)) {
          const who = member(c.lastFrom)?.name || 'Someone';
          toast(c.lastKind === 'p' ? `${who} sent you a payment` : c.lastKind === 'c' ? `${who} updated a payment receipt` : `New private message from ${who}`, 'accent');
          try { navigator.vibrate?.(120); } catch {}
        }
      }
    }
    first = false;
    renderMain();
  }, () => {}));
}
const unreadCount = () => Object.entries(S.chats || {}).filter(([pid, c]) => c.lastFrom !== S.user.uid && tsMs(c.lastAt) > lastRead(pid)).length;

function openChat(uid) {
  closeChat();
  S.chatWith = uid; S.msgs = []; S.plain = new Map(); S.chatErr = ''; S.payOpen = false; S.chatPending = null; S.chatReady = false; S.animated = new Set();
  const pid = pairId(uid);
  S.chatUnsub = onSnapshot(query(collection(db, 'circles', S.circleId, 'chats', pid, 'msgs'), orderBy('at', 'desc'), limit(200)), (s) => {
    S.msgs = s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })).reverse();
    store.set(readKey(pid), Date.now());
    decryptAll(); renderMain();
  }, () => { S.chatErr = 'This conversation couldn’t be opened.'; renderMain(); });
  Promise.all([loadDaily('chat'), loadDaily('pay')]).then(() => renderMain());
}
function closeChat() { S.chatUnsub?.(); S.chatUnsub = null; S.chatWith = null; S.msgs = []; S.payOpen = false; }

async function decryptAll() {
  const uid = S.chatWith; if (!uid) return;
  const kk = await keyFor(uid).catch(() => null), pid = pairId(uid);
  let changed = false;
  for (const m of S.msgs) {
    if (S.plain.has(m.id)) continue;
    if (!kk || m.kf !== kk.kf) { S.plain.set(m.id, { locked: true }); changed = true; continue; }
    try { S.plain.set(m.id, await openJson(kk.k, m.ct, m.iv, chatAad(pid, m.id, m.from, m.kind))); }
    catch { S.plain.set(m.id, { bad: true }); }
    changed = true;
  }
  if (changed && S.chatWith === uid) renderMain();
  if (S.chatWith === uid) S.chatReady = true;
}

function viewChat() {
  if (S.chatWith && member(S.chatWith)?.status === 'active') return chatRoom(member(S.chatWith));
  if (S.chatWith) closeChat();
  const people = talkable();
  const meUpi = me()?.upi;
  const rows = people.map((m) => {
    const pid = pairId(m.uid), c = S.chats?.[pid], unread = c && c.lastFrom !== S.user.uid && tsMs(c.lastAt) > lastRead(pid);
    const last = c ? (c.lastKind === 'p' ? 'Payment' : c.lastKind === 'c' ? 'Payment update' : c.lastKind === 'f' ? 'File' : 'Message') + (c.lastFrom === S.user.uid ? ' you sent' : ' received') + ` · ${ago(tsMs(c.lastAt))}` : 'Start a private conversation';
    return `<li><button class="chat-row${unread ? ' unread' : ''}" data-act="chat-open" data-uid="${esc(m.uid)}">
      ${ava(m, 'big')}
      <span class="grow"><b>${esc(m.name)}</b><span class="muted small">${esc(m.title || '')}${m.upi ? ' · ₹ UPI ready' : ''}</span><span class="small last">${esc(last)}</span></span>
      ${unread ? '<span class="dot" aria-label="Unread"></span>' : ''}<span class="chev" aria-hidden="true">›</span></button></li>`;
  }).join('');
  return `<section class="card lock-card"><div class="lock-ic">${ICON.lock}</div><div><b>Only the two of you can read it.</b>
      <span class="muted small">Messages, files and payment notes are encrypted on your phones. Other members, admins and Verth can’t read them.</span></div></section>
    <section class="card"><h2>People in ${esc(S.circle.name)}</h2>
      ${people.length ? `<ul class="list chat-list">${rows}</ul>` : '<p class="muted">Nobody to chat with yet. Invite people from the Circle tab.</p>'}
      ${unlimitedTalk() ? '' : `<p class="muted small">Free plan: ${CHAT_FREE} messages and ${PAY_FREE} payments a day. Family and Team plans are unlimited.</p>`}</section>
    ${payHistoryCard()}
    <section class="card"><h2>Receive money safely</h2>
      <p class="muted">Add your UPI ID so people in ${esc(S.circle.name)} can pay you with “Pay safely”. They’ll always pay the ID you set here, never one sent in a message.</p>
      <form data-form="set-upi" class="row gap upi-form" novalidate><input id="u-upi" placeholder="yourname@okhdfcbank" value="${esc(meUpi || '')}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="100" aria-label="Your UPI ID" data-upi-look="u-name">
        <button class="btn primary" type="submit">${meUpi ? 'Update' : 'Save'}</button></form>
      <p class="upi-name" id="u-name" aria-live="polite">${upiNameLine(meUpi)}</p>
      ${meUpi ? `<p class="small ok-inline">Saved: ${esc(meUpi)}. <button class="link" data-act="upi-clear">Remove</button></p>` : ''}
      <p class="err" id="u-err" role="alert"></p></section>`;
}

function bubble(m, other) {
  const mine = m.from === S.user.uid, p = S.plain.get(m.id), t = fmtTime(m.at);
  // Only messages that just arrived animate in; re-renders don't replay it.
  S.animated ||= new Set();
  const fresh = S.chatReady && !S.animated.has(m.id) ? ' new' : '';
  if (p) S.animated.add(m.id);
  let body;
  if (!p) body = '<span class="muted small">Unlocking…</span>';
  else if (p.locked) body = `<span class="muted small">🔒 Locked to ${mine ? 'your' : `${esc(other.name.split(' ')[0])}’s`} previous device. It can’t be opened here.</span>`;
  else if (p.bad) body = '<span class="muted small">⚠️ This message was changed or damaged and can’t be trusted.</span>';
  else if (m.kind === 'c') {
    const who = mine ? 'You' : esc(other.name.split(' ')[0]);
    const txt = p.status === 'paid' ? `${who} marked ${rupees(p.amount)} as paid${p.utr ? ` · UPI ref ${esc(p.utr)}` : ''}` : p.status === 'received' ? `${who} confirmed receiving ${rupees(p.amount)}` : `${who} said the ${rupees(p.amount)} payment didn’t go through`;
    return `<div class="msg sys${fresh}"><span class="sys-pill ${p.status}">${p.status === 'failed' ? '⚠️' : '✓'} ${txt}</span></div>`;
  } else if (m.kind === 'p') {
    const st = payStatus(m.id), first = esc(other.name.split(' ')[0]);
    const chips = `${st.paid ? `<span class="pc-chip ok">✓ Paid${st.paid.utr ? ` · ref ${esc(st.paid.utr)}` : ''}</span>` : ''}${st.received ? '<span class="pc-chip ok">✓ Received</span>' : ''}${st.failed && !st.paid ? '<span class="pc-chip bad">Didn’t go through</span>' : ''}`;
    const acts = mine
      ? (!st.paid && !st.failed ? `<button class="btn small dark" data-act="pay-mark" data-id="${esc(m.id)}" data-v="paid">Mark as paid</button><button class="link small" data-act="pay-mark" data-id="${esc(m.id)}" data-v="failed">It didn’t go through</button>` : '')
      : (!st.received ? `<button class="btn small dark" data-act="pay-mark" data-id="${esc(m.id)}" data-v="received">I received it</button>` : '');
    return `<div class="msg pay ${mine ? 'me' : 'them'}${fresh}"><div class="pay-card"><span class="eyebrow">${mine ? `You paid ${first}` : `${first} is paying you`} · UPI</span>
      <b class="amt">${rupees(p.amount)}</b>${p.note ? `<span class="pay-note">${esc(p.note)}</span>` : ''}
      <span class="small">To ${esc(p.upi)}</span>
      ${chips ? `<span class="pc-chips">${chips}</span>` : `<span class="small muted">${mine ? 'Opened in your UPI app. Check your bank app, then mark it as paid.' : 'Check your bank app, then confirm you received it.'}</span>`}
      <span class="pc-acts">${acts}<button class="link small" data-act="receipt" data-id="${esc(m.id)}">View receipt</button></span></div><time>${t}</time></div>`;
  } else if (m.kind === 'f') {
    const img = VIEWABLE.includes(p.type), shown = S.fileUrls?.get(m.id);
    body = `${img && shown ? `<img class="att" src="${shown}" alt="${esc(p.name)}" draggable="false">` : ''}
      <span class="file-card"><span class="file-ic">${img ? '🖼️' : /pdf/.test(p.type) ? '📄' : '📎'}</span><span class="grow"><b>${esc(p.name)}</b><span class="small">${fmtBytes(p.size)} · encrypted</span></span>
      <button class="btn small" data-act="file-open" data-id="${esc(m.id)}">${S.fileBusy === m.id ? 'Opening…' : img && !shown ? 'View' : 'Open'}</button></span>
      ${p.caption ? `<p>${esc(p.caption)}</p>` : ''}`;
  } else {
    const link = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|net|org|xyz|top|info|online|site|co)\b\S*/i.exec(p.body || '');
    body = `<p>${esc(p.body)}</p>${!mine && link ? `<button class="link small" data-act="chat-check" data-text="${esc(link[0])}">Check this link in Scam check</button>` : ''}`;
  }
  return `<div class="msg ${mine ? 'me' : 'them'}${fresh}"><div class="bub">${body}</div><time>${t}${mine ? ` · <button class="link tiny" data-act="msg-del" data-id="${esc(m.id)}">Delete</button>` : ''}</time></div>`;
}

function chatRoom(o) {
  const first = o.name.split(' ')[0], left = leftToday('chat'), payLeft = leftToday('pay');
  const ready = thisDeviceActive() && !!o.device?.dh;
  let lastDay = '';
  const items = S.msgs.map((m) => {
    const d = new Date(tsMs(m.at)), day = d.toDateString();
    const sep = day !== lastDay ? `<div class="day-sep"><span>${day === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></div>` : '';
    lastDay = day;
    return sep + bubble(m, o);
  }).join('');
  const recentUpi = o.upiAt && Date.now() - tsMs(o.upiAt) < 48 * 3600e3;
  S.payWho = o.name;
  const pay = S.payOpen ? `<div class="pay-sheet" role="dialog" aria-label="Pay ${esc(first)}">
      <div class="split"><h3>Pay ${esc(first)} safely</h3><button class="link" data-act="pay-close">Close</button></div>
      ${o.upi ? `<p class="small">To <b>${esc(o.upi)}</b>, the UPI ID ${esc(first)} saved in Verth.${recentUpi ? '' : ' ✓'}</p>
        <p class="upi-name" id="pay-name" aria-live="polite">${upiNameLine(o.upi, o.name)}</p>
        ${recentUpi ? `<p class="small warn-inline">${esc(first)} changed this UPI ID ${ago(tsMs(o.upiAt))}. If you weren’t expecting that, ask them on a call before paying.</p>` : ''}
        ${S.payQr ? `<div class="qr-box"><div class="qr">${S.payQr}</div><p class="small">Scan with any UPI app on your phone. On a phone, the UPI app opens by itself.</p>
          <button class="btn small" data-act="copy" data-text="${esc(o.upi)}">Copy UPI ID</button></div>`
        : payLeft <= 0 ? upsell('pay')
        : `<form data-form="pay" class="stack" novalidate>
          <label>Amount (₹)<input id="p-amt" inputmode="decimal" placeholder="e.g. 5000" maxlength="9" autocomplete="off"></label>
          <label>What’s it for? <span class="muted small">(optional, only the two of you see it)</span><input id="p-note" maxlength="60" placeholder="e.g. Rent for March"></label>
          <p class="err" id="p-err" role="alert"></p>
          <button class="btn gold big" type="submit">Pay with my UPI app</button>
          <p class="muted small">Your own UPI app (GPay, PhonePe, Paytm…) makes the payment and asks for your PIN. Verth never touches your money.${payLeft !== Infinity ? ` ${payLeft} of ${PAY_FREE} free payments left today.` : ''}</p></form>`}`
      : `<p class="muted">${esc(first)} hasn’t added a UPI ID in Verth yet, so there’s nothing safe to pay. Ask ${esc(first)} to add one in the Chat tab. Don’t pay an ID someone sends you in a message.</p>`}
    </div>` : '';
  return `<div class="chat-room">
    <header class="chat-head"><button class="back" data-act="chat-back" aria-label="Back to chats">‹</button>
      ${ava(o)}
      <span class="grow"><b>${esc(o.name)}</b><span class="small">${ICON.lock} Encrypted · copying off</span></span>
      <button class="btn small gold" data-act="pay-open">₹ Pay</button></header>
    <div class="chat-scroll" id="chat-scroll">
      <div class="chat-wm" aria-hidden="true">${Array.from({ length: 24 }, () => `<span>${esc(me()?.name || '')} · ${esc(maskEmail(S.user.email))}</span>`).join('')}</div>
      <div class="chat-away" aria-hidden="true">${ICON.lock}<b>Hidden for privacy</b><span>Come back to Verth to see this chat.</span></div>
      ${S.chatErr ? `<p class="muted center">${esc(S.chatErr)}</p>` : ''}
      ${items || `<div class="chat-empty">${ICON.lock}<b>Say hello to ${esc(first)}</b><span class="small">Messages and files here are locked to your two phones. Not even the circle admin can read them.</span></div>`}
      ${S.chatPending ? `<div class="msg me"><div class="bub sending"><span class="spin"></span> ${esc(S.chatPending)}</div></div>` : ''}
    </div>
    ${pay}
    ${S.payAwait && S.payAwait.uid === o.uid && !S.payOpen && S.plain.get(S.payAwait.id) && !payStatus(S.payAwait.id).paid && !payStatus(S.payAwait.id).failed ? `<div class="pay-ask"><b>Did your ${rupees(S.plain.get(S.payAwait.id).amount)} payment to ${esc(first)} go through?</b>
      <form data-form="pay-confirm" class="row gap" novalidate><input id="pc-utr" maxlength="22" inputmode="numeric" placeholder="UPI ref no. (optional)" autocomplete="off"><button class="btn small ok" type="submit">Yes, paid</button><button type="button" class="btn small ghost" data-act="pay-mark" data-id="${esc(S.payAwait.id)}" data-v="failed">No</button></form></div>` : ''}
    ${!ready ? `<p class="warn">${thisDeviceActive() ? `${esc(first)} needs to open Verth once before you can chat.` : 'Chat works on the device Verth is set up on.'}</p>`
      : left <= 0 ? upsell('chat')
      : `<form data-form="chat" class="composer" novalidate>
        <label class="attach" title="Send a photo or document">${ICON.clip}<input id="c-file" type="file" class="sr-file" data-keep="no" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" aria-label="Attach a photo or document"></label>
        <textarea id="c-text" rows="1" maxlength="4000" placeholder="Message ${esc(first)}…" aria-label="Message"></textarea>
        <button class="send" type="submit" aria-label="Send">${ICON.send}</button></form>
        ${left !== Infinity ? `<p class="quota">${left} of ${CHAT_FREE} free messages left today</p>` : ''}`}
  </div>`;
}

function upsell(kind) {
  return `<div class="upsell"><b>${kind === 'pay' ? `You’ve used today’s ${PAY_FREE} free payments.` : `You’ve used today’s ${CHAT_FREE} free messages.`}</b>
    <span>Upgrade to a Family or Team plan for unlimited private chat and payments, for everyone in your circle. Your free allowance comes back tomorrow.</span>
    <button class="btn primary" data-act="tab" data-tab="plan">See plans</button></div>`;
}

async function sendChat({ kind, payload, file }) {
  const uid = S.chatWith, o = member(uid), pid = pairId(uid);
  const kk = await keyFor(uid);
  if (!kk) throw new Error(`${o?.name?.split(' ')[0] || 'They'} need to open Verth once before you can chat.`);
  await loadDaily(kind === 'p' ? 'pay' : 'chat');
  const ref = doc(collection(db, 'circles', S.circleId, 'chats', pid, 'msgs'));
  const aad = chatAad(pid, ref.id, S.user.uid, kind);
  const b = writeBatch(db);
  const done = meterOp(b, kind === 'p' ? 'pay' : 'chat');
  const sealed = await sealJson(kk.k, payload, aad);
  const msg = { from: S.user.uid, to: uid, kind, ct: sealed.ct, iv: sealed.iv, kf: kk.kf, at: serverTimestamp() };
  if (file) {
    const parts = Math.ceil(file.length / PART) || 1;
    msg.parts = parts;
    for (let i = 0; i < parts; i++) {
      const piece = await sealBytes(kk.k, file.subarray(i * PART, (i + 1) * PART), `${aad}|part${i}`);
      b.set(doc(db, 'circles', S.circleId, 'chats', pid, 'msgs', ref.id, 'parts', String(i)), piece);
    }
  }
  b.set(ref, msg);
  b.set(doc(db, 'circles', S.circleId, 'chats', pid), { members: pairOf(S.user.uid, uid), lastAt: serverTimestamp(), lastFrom: S.user.uid, lastKind: kind });
  try { await b.commit(); }
  catch (e) {
    if (e?.code === 'permission-denied') { S.daily = null; await loadDaily(kind === 'p' ? 'pay' : 'chat'); }
    throw e;
  }
  done();
  return ref.id;
}

async function readFile(f) {
  let bytes = new Uint8Array(await f.arrayBuffer()), type = f.type || 'application/octet-stream', name = f.name || 'file';
  // Big photos are shrunk so they fit; documents must already be under 2 MB.
  if (bytes.length > FILE_MAX && /^image\/(jpeg|png|webp)$/.test(type)) {
    const img = await createImageBitmap(f), scale = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    bytes = new Uint8Array(await blob.arrayBuffer()); type = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg';
  }
  if (bytes.length > FILE_MAX) throw new Error('That file is bigger than 2 MB. Send a smaller PDF, or a photo of it.');
  return { bytes, type: type.slice(0, 80), name: name.replace(/[\\/<>:"|?*\u0000-\u001f]/g, '_').slice(0, 80) };
}

function payLink(o, amount, note) {
  const q = new URLSearchParams({ pa: o.upi, pn: o.name.slice(0, 40), am: amount.toFixed(2), cu: 'INR' });
  if (note) q.set('tn', note.slice(0, 50));
  return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}
function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

Object.assign(actions, {
  'chat-open': (el) => { S.tab = 'chat'; openChat(el.dataset.uid); renderMain(); },
  'chat-back': () => { closeChat(); renderMain(); },
  'guard-open': () => { if (S.circle) { S.tab = 'guard'; renderMain(); } else { S.guardOpen = true; renderScanView(); } window.scrollTo(0, 0); guardExtras(); },
  'guard-close': () => { S.guardOpen = false; S.soloTab = 'home'; renderScanView(); },
  'guard-repeat': () => { guardRepeat(); toast('Confirmed for today. Well done! 🛡️', 'ok'); renderScanView(); shareScore(); },
  'guard-tick': (el) => { guardSet(el.dataset.id, !el.closest('.g-item').classList.contains('done')); renderScanView(); shareScore(); },
  'guard-plans': () => { if (S.circle) { S.tab = 'plan'; renderMain(); } else { S.soloTab = 'plan'; renderScanView(); } window.scrollTo(0, 0); },
  'guard-share': async () => {
    if (!S.circleId) return;
    if (sharing()) {
      store.set(shareKey(), null);
      try { const b = writeBatch(db); b.delete(doc(db, 'circles', S.circleId, 'safety', S.user.uid)); await b.commit(); } catch {}
      if (S.board) delete S.board[S.user.uid];
      toast('Your score is no longer shared.', 'ok');
    } else { store.set(shareKey(), 1); await shareScore(); toast('Your circle can now see your daily safety score.', 'ok'); }
    renderScanView();
  },
  'xray-clear': () => { S.xray = null; renderScanView(); },
  'doctor-ask': (el) => askDoctor(el.dataset.q),
  'trial-plans': () => { store.set('verth-trial-seen', 1); if (S.circle) { S.tab = 'plan'; renderMain(); } else renderScanView(); },
  'chat-check': (el) => { closeChat(); S.tab = 'scan'; S.scanKind = 'link'; S.prefill = { kind: 'link', text: el.dataset.text, from: 'chat' }; renderMain(); },
  'pay-open': () => { S.payOpen = !S.payOpen; S.payQr = null; loadDaily('pay').then(renderMain); renderMain(); },
  'pay-close': () => { S.payOpen = false; S.payQr = null; renderMain(); },
  'upi-clear': async () => {
    try { await updateDoc(doc(db, 'circles', S.circleId, 'members', S.user.uid), { upi: null, upiAt: serverTimestamp() }); toast('UPI ID removed.'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'msg-del': async (el) => {
    const m = S.msgs.find((x) => x.id === el.dataset.id); if (!m) return;
    if (S.confirmDel !== m.id) { S.confirmDel = m.id; toast('Tap Delete again to delete it for both of you.'); return; }
    S.confirmDel = null;
    try {
      const b = writeBatch(db), base = ['circles', S.circleId, 'chats', pairId(S.chatWith), 'msgs', m.id];
      for (let i = 0; i < (m.parts || 0); i++) b.delete(doc(db, ...base, 'parts', String(i)));
      b.delete(doc(db, ...base));
      await b.commit(); toast('Deleted for both of you.');
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  'file-open': async (el) => {
    const m = S.msgs.find((x) => x.id === el.dataset.id), p = S.plain.get(m?.id);
    if (!m || !p || p.locked || p.bad) return;
    S.fileUrls ||= new Map();
    const view = VIEWABLE.includes(p.type);
    if (!S.fileUrls.has(m.id)) {
      S.fileBusy = m.id; renderMain();
      try {
        const kk = await keyFor(S.chatWith), pid = pairId(S.chatWith), aad = chatAad(pid, m.id, m.from, 'f');
        const chunks = [];
        for (let i = 0; i < m.parts; i++) {
          const s = await getDoc(doc(db, 'circles', S.circleId, 'chats', pid, 'msgs', m.id, 'parts', String(i)));
          if (!s.exists()) throw new Error('Part of this file is missing.');
          chunks.push(await openBytes(kk.k, s.data().ct, s.data().iv, `${aad}|part${i}`));
        }
        // Only plain pictures and PDFs open in the browser; anything else downloads, so it can't run as a web page.
        const safeType = view || p.type === 'application/pdf' ? p.type : 'application/octet-stream';
        S.fileUrls.set(m.id, URL.createObjectURL(new Blob(chunks, { type: safeType })));
      } catch (e) { toast(e.message?.includes('missing') ? e.message : 'This file couldn’t be opened.', 'bad'); S.fileBusy = null; return renderMain(); }
      S.fileBusy = null;
    }
    if (view && el.textContent.trim() === 'View') return renderMain();
    const a = document.createElement('a'); a.href = S.fileUrls.get(m.id); a.download = p.name; a.rel = 'noopener';
    if (p.type === 'application/pdf' || view) a.target = '_blank';
    a.click(); renderMain();
  },
});

Object.assign(forms, {
  chat: async (f) => {
    const ta = f.querySelector('#c-text'), text = ta.value.trim(), fileIn = f.querySelector('#c-file'), file = fileIn.files?.[0];
    if (!text && !file) return;
    if (leftToday('chat') <= 0) return renderMain();
    if (looksSensitive(text)) { toast('That looks like an OTP, PIN or password. Never send those, not even here.', 'bad'); return; }
    busy(f, true);
    try {
      if (file) {
        S.chatPending = `Encrypting ${file.name}…`; renderMain();
        const r = await readFile(file);
        await sendChat({ kind: 'f', payload: { name: r.name, type: r.type, size: r.bytes.length, caption: text.slice(0, 500) }, file: r.bytes });
      } else {
        await sendChat({ kind: 'm', payload: { body: text } });
      }
      const t = document.getElementById('c-text'); if (t) t.value = '';
      S.chatPending = null; renderMain();
    } catch (e) {
      S.chatPending = null; renderMain();
      toast(e?.code === 'permission-denied' ? (leftToday('chat') <= 0 ? 'You’ve used today’s free messages.' : 'Couldn’t send. Check that you’re both still in the circle.') : (e.message || friendlyError(e)), 'bad');
    }
    busy(document.querySelector('form[data-form="chat"]'), false);
  },
  pay: async (f) => {
    const o = member(S.chatWith);
    const amount = Math.round(parseFloat(String(f.querySelector('#p-amt').value).replace(/[,\s₹]/g, '')) * 100) / 100;
    const note = f.querySelector('#p-note').value.trim().replace(/[^\p{L}\p{N} .,'()/-]/gu, '').slice(0, 50);
    if (!o?.upi || !UPI_RE.test(o.upi)) return setErr('p-err', 'This person has no valid UPI ID in Verth.');
    if (!(amount >= 1 && amount <= 100000)) return setErr('p-err', 'Enter an amount between ₹1 and ₹1,00,000 (the UPI limit).');
    busy(f, true);
    try {
      const mid = await sendChat({ kind: 'p', payload: { amount, note, upi: o.upi } });
      S.payAwait = { id: mid, uid: o.uid };
      const link = payLink(o, amount, note);
      if (isPhone()) { S.payOpen = false; renderMain(); location.href = link; }
      else { S.payQr = qrSvg(link); renderMain(); }
    } catch (e) {
      busy(f, false);
      setErr('p-err', e?.code === 'permission-denied' ? 'You’ve used today’s free payments. Upgrade for unlimited.' : (e.message || friendlyError(e)));
    }
  },
  'set-upi': async (f) => {
    const v = f.querySelector('#u-upi').value.trim().toLowerCase();
    if (!UPI_RE.test(v)) return setErr('u-err', 'That doesn’t look like a UPI ID. It looks like name@bank, for example priya@okhdfcbank.');
    f.querySelector('#u-upi').value = v;
    busy(f, true);
    try { await updateDoc(doc(db, 'circles', S.circleId, 'members', S.user.uid), { upi: v, upiAt: serverTimestamp() }); toast('UPI ID saved. People in your circle can now pay you safely.', 'ok'); }
    catch (e) { setErr('u-err', friendlyError(e)); }
    busy(f, false);
  },
});


/* ---------- Pay safely: confirmations, receipts and history ---------- */
// Verth can't see bank transfers, so a receipt carries what the two people confirm: the payer marks
// it paid (optionally with the UPI reference) and the receiver confirms it arrived. All encrypted.
function payStatus(id, msgs = S.msgs, plain = S.plain) {
  const out = {};
  for (const m of msgs) {
    const c = m.kind === 'c' ? plain.get(m.id) : null;
    if (c && c.ref === id) out[c.status] = { by: m.from, at: m.at, utr: c.utr || '' };
  }
  return out;
}
async function confirmPay(id, status, utr = '') {
  const p = S.plain.get(id);
  if (!p) return;
  await sendChat({ kind: 'c', payload: { ref: id, status, amount: p.amount, ...(utr ? { utr } : {}) } });
  if (S.payAwait?.id === id) S.payAwait = null;
  toast(status === 'paid' ? 'Marked as paid. The receipt is updated for both of you.' : status === 'received' ? 'Thanks! The receipt now shows it was received.' : 'Noted. Nothing was marked as paid.', status === 'failed' ? '' : 'ok');
}
const receiptNo = (id) => 'VR-' + String(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
function receiptHtml(r) {
  const fmtD = (t) => new Date(tsMs(t)).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const st = r.status, state = st.received ? ['ok', 'Received'] : st.paid ? ['ok', 'Paid'] : st.failed ? ['bad', 'Not completed'] : ['wait', 'Awaiting confirmation'];
  return `<div class="rc-card" id="rc-card">
    <div class="rc-top"><span class="rc-brand">${ICON.check}<b>Verth</b></span><span class="rc-tag">Payment receipt</span></div>
    <div class="rc-amt"><span class="rc-state ${state[0]}">${state[1]}</span><b>${rupees(r.amount)}</b>${r.note ? `<span>${esc(r.note)}</span>` : ''}</div>
    <div class="rc-who"><div><span class="avatar">${initials(r.fromName)}</span><b>${esc(r.fromName)}</b><small>Paid by</small></div><span class="rc-arrow">→</span><div><span class="avatar">${initials(r.toName)}</span><b>${esc(r.toName)}</b><small>Paid to</small></div></div>
    <dl class="rc-rows">
      <div><dt>To UPI ID</dt><dd>${esc(r.upi)}</dd></div>
      <div><dt>Date and time</dt><dd>${fmtD(r.at)}</dd></div>
      <div><dt>Receipt no.</dt><dd>${receiptNo(r.id)}</dd></div>
      ${st.paid ? `<div><dt>Marked paid</dt><dd>${fmtD(st.paid.at)}${st.paid.utr ? `<br>UPI ref ${esc(st.paid.utr)}` : ''}</dd></div>` : ''}
      ${st.received ? `<div><dt>Receipt confirmed</dt><dd>${fmtD(st.received.at)} by ${esc(r.toName)}</dd></div>` : ''}
      <div><dt>Circle</dt><dd>${esc(r.circle)}</dd></div>
    </dl>
    <p class="rc-foot">${ICON.lock} Paid through the payer’s own UPI app; Verth never holds or moves money. This receipt is end-to-end encrypted and only ${esc(r.fromName.split(' ')[0])} and ${esc(r.toName.split(' ')[0])} can see it.</p>
  </div>`;
}
function openReceipt(r) {
  closeReceipt();
  const m = document.createElement('div');
  m.className = 'rc-modal'; m.id = 'rc-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Payment receipt');
  m.innerHTML = `<div class="rc-sheet">${receiptHtml(r)}<div class="rc-btns"><button class="btn primary" data-rc="print">Save as PDF / Print</button><button class="btn ghost" data-rc="close">Close</button></div></div>`;
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-rc]'); if (b?.dataset.rc === 'print') window.print(); else if (b?.dataset.rc === 'close' || e.target === m) closeReceipt(); });
  document.body.appendChild(m); document.body.classList.add('rc-open');
}
function closeReceipt() { document.getElementById('rc-modal')?.remove(); document.body.classList.remove('rc-open'); }
function receiptFrom(m, p, msgs, plain, otherUid) {
  const mine = m.from === S.user.uid, o = member(otherUid);
  return { id: m.id, amount: p.amount, note: p.note, upi: p.upi, at: m.at, fromName: mine ? (me()?.name || '') : (o?.name || ''), toName: mine ? (o?.name || '') : (me()?.name || ''), circle: S.circle?.name || '', status: payStatus(m.id, msgs, plain) };
}

// History across all of this person's conversations in the circle (decrypted on this phone).
async function loadPayHistory() {
  S.payHist = { loading: true, items: [] }; renderMain();
  const items = [];
  for (const [pid, c] of Object.entries(S.chats || {})) {
    const other = (c.members || []).find((u) => u !== S.user.uid);
    const kk = other ? await keyFor(other).catch(() => null) : null;
    if (!kk) continue;
    let snap;
    try { snap = await getDocs(query(collection(db, 'circles', S.circleId, 'chats', pid, 'msgs'), where('kind', 'in', ['p', 'c']))); } catch { continue; }
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })), plain = new Map();
    for (const m of msgs) {
      if (m.kf !== kk.kf) continue;
      try { plain.set(m.id, await openJson(kk.k, m.ct, m.iv, chatAad(pid, m.id, m.from, m.kind))); } catch {}
    }
    for (const m of msgs) if (m.kind === 'p' && plain.get(m.id)) items.push(receiptFrom(m, plain.get(m.id), msgs, plain, other));
  }
  items.sort((a, b) => tsMs(b.at) - tsMs(a.at));
  S.payHist = { loading: false, items };
  renderMain();
}
function payHistoryCard() {
  const h = S.payHist;
  if (!h) return `<section class="card"><div class="split"><h2>Your payments</h2><button class="btn small" data-act="pay-history">Show history</button></div><p class="muted small">Every Pay safely payment, with a receipt. Only you and the other person can see them.</p></section>`;
  if (h.loading) return '<section class="card"><h2>Your payments</h2><p class="muted"><span class="spin"></span> Unlocking your receipts…</p></section>';
  const total = (dir) => h.items.filter((r) => (dir === 'out') === (r.fromName === (me()?.name || ''))).reduce((a, r) => a + Number(r.amount || 0), 0);
  return `<section class="card"><h2>Your payments</h2>
    ${h.items.length ? `<div class="ph-tot"><div><small>Paid</small><b>${rupees(total('out'))}</b></div><div><small>Received</small><b>${rupees(total('in'))}</b></div></div>
    <ul class="list ph-list">${h.items.map((r, i) => { const out = r.fromName === (me()?.name || ''); const st = r.status.received ? 'Received' : r.status.paid ? 'Paid' : r.status.failed ? 'Not completed' : 'Awaiting'; return `<li><button class="ph-row" data-act="hist-receipt" data-i="${i}"><span class="ph-ic ${out ? 'out' : 'in'}">${out ? '↗' : '↙'}</span><span class="grow"><b>${out ? `To ${esc(r.toName)}` : `From ${esc(r.fromName)}`}</b><span class="muted small">${new Date(tsMs(r.at)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${st}${r.note ? ` · ${esc(r.note)}` : ''}</span></span><b class="ph-amt ${out ? 'out' : 'in'}">${out ? '−' : '+'}${rupees(r.amount)}</b></button></li>`; }).join('')}</ul>`
    : '<p class="muted">No payments yet. Open a chat and tap “₹ Pay”.</p>'}</section>`;
}
Object.assign(actions, {
  'pay-mark': async (el) => { el.disabled = true; try { await confirmPay(el.dataset.id, el.dataset.v); } catch (e) { toast(e.message || friendlyError(e), 'bad'); el.disabled = false; } },
  receipt: (el) => {
    const m = S.msgs.find((x) => x.id === el.dataset.id), p = S.plain.get(el.dataset.id);
    if (m && p && !p.locked && !p.bad) openReceipt(receiptFrom(m, p, S.msgs, S.plain, S.chatWith));
  },
  'pay-history': () => loadPayHistory(),
  'hist-receipt': (el) => { const r = S.payHist?.items?.[+el.dataset.i]; if (r) openReceipt(r); },
});
Object.assign(forms, {
  'pay-confirm': async (f) => {
    const utr = f.querySelector('#pc-utr').value.replace(/[^0-9A-Za-z]/g, '').slice(0, 22);
    busy(f, true);
    try { await confirmPay(S.payAwait.id, 'paid', utr); } catch (e) { toast(e.message || friendlyError(e), 'bad'); busy(f, false); }
  },
});

/* ---------- wide screens: side navigation and a right-hand panel ---------- */
// Laptops and desktops get a three-column layout; phones keep the bottom tabs. Everything here is
// hidden below 1280px wide.
const DAILY_TIPS = [
  ['Pause before you pay', 'Scammers create panic so you don’t think. A 2-minute check beats a lifetime of regret.'],
  ['Banks never ask for OTPs', 'No bank, police officer or company will ever ask for your OTP, UPI PIN or CVV.'],
  ['To receive money, no PIN', 'If someone says “enter your PIN to receive money”, it’s a scam. PINs only send money.'],
  ['Check the real website', 'Type the address yourself. Links in messages can look real but lead somewhere else.'],
  ['New number? Verify first', '“Hi Mom, this is my new number” is the oldest trick. Ask them on Verth or call the old number.'],
  ['No APKs from chats', 'Never install an app someone sends on WhatsApp. Real apps come from the Play Store.'],
  ['Jobs never cost money', 'Real employers never charge for exams, training, uniforms or laptops.'],
];
// Where the quote rotation is right now, so re-drawing the page doesn't restart it.
const quoteClock = () => ((Date.now() % (QUOTES.length * 5000)) / 1000).toFixed(2);
function rail() {
  const day = Math.floor(Date.now() / 864e5), tip = DAILY_TIPS[day % DAILY_TIPS.length];
  const [k, label] = badgeOf(), p = S.profile || {};
  const alerts = ALERTS.slice(day % 3, (day % 3) + 4);
  return `<aside class="rail" aria-label="Safety corner">
    <section class="rl-me b-${k}"><button class="rl-me-in" data-act="profile-open">${ava({ name: p.name, photo: p.photo })}<span class="grow"><b>${esc(p.name || '')}</b><span>${k === 'trial' ? `✨ Free trial · ${trialDaysLeft()} days left` : k === 'free' ? 'Free plan' : `${BADGE_IC[k] || ''} ${label} member`}</span></span><span class="chev">›</span></button></section>
    <section class="rl-quotes"><span class="eyebrow">Words to stay safe by</span>
      <div class="rq-wrap" style="--t:${quoteClock()}s">${QUOTES.map(([en, hi], i) => `<figure style="--i:${i};--n:${QUOTES.length}"><blockquote>${esc(en)}</blockquote><figcaption>${esc(hi)}</figcaption></figure>`).join('')}</div></section>
    <section class="rl-tip"><span class="rt-ic">💡</span><div><span class="eyebrow">Today’s safety tip</span><b>${esc(tip[0])}</b><p>${esc(tip[1])}</p></div></section>
    <section class="rl-alerts"><div class="split"><span class="eyebrow">Scams going around</span><span class="live">● Live</span></div>
      <ul>${alerts.map((a) => `<li><span class="ra-tag t-${a.tone}">${esc(a.tag)}</span><b>${esc(a.t)}</b><span>${esc(a.flag)}</span></li>`).join('')}</ul>
      <button class="link small" data-act="tab" data-tab="home">See all scam alerts</button></section>
    <section class="rl-guard">${guardMini()}</section>
    <section class="rl-help"><b>Lost money to a scam?</b><span>Call <a href="tel:1930">1930</a> within the first hour, or report at <a href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a>.</span></section>
    <p class="rl-foot">Made with care in India · Stay alert, stay safe.</p>
  </aside>`;
}
function guardMini() {
  const n = guardScore();
  return `<div class="gm"><b>${n}/10</b><div><span class="eyebrow">Phone safety</span><span>${n === 10 ? 'Today’s check-up done ✓' : n ? `${10 - n} left today` : 'Today’s check-up is ready'}</span></div><button class="btn small" data-act="guard-open">${n === 10 ? 'View' : n ? 'Continue' : 'Start'}</button></div>`;
}
// Sign-up and log-in pages on wide screens: a story panel beside the form.
function authFrame(html) {
  return `<div class="auth-frame"><aside class="auth-side" aria-hidden="true">
    <div class="as-in">
      <span class="as-brand">${ICON.check}<b>Verth</b></span>
      <h2>Is it really them?<span>Check before you pay.</span></h2>
      <p class="as-pitch">UPI tells you <em>who</em> you’re paying. <b>Verth tells you whether you should.</b></p>
      <div class="as-quotes" style="--t:${quoteClock()}s">${QUOTES.map(([en, hi], i) => `<figure style="--i:${i};--n:${QUOTES.length}"><blockquote>“${esc(en)}”</blockquote><figcaption>${esc(hi)}</figcaption></figure>`).join('')}</div>
      <ul class="as-points">
        <li>${ICON.ok}<span><b>Scam check</b> for messages, links, numbers, jobs and screenshots</span></li>
        <li>${ICON.ok}<span><b>Ask the real person</b> on their own phone before anyone pays</span></li>
        <li>${ICON.ok}<span><b>Private chat and Pay safely</b>, end-to-end encrypted</span></li>
        <li>${ICON.ok}<span><b>7 days free</b>, everything unlimited</span></li>
      </ul>
      <p class="as-foot">Made in India · English and हिन्दी</p>
    </div></aside>${html}</div>`;
}

/* ---------- app lock: fingerprint / face (or an email code) every time Verth opens ---------- */
// Like a banking app: each new visit, and after 5 minutes in the background, Verth asks the person
// to unlock it. The fingerprint check is verified by the Verth server (passkey); without one, an
// email code does the same job. It can be switched off in the profile.
const appLockOn = () => store.get('verth-applock') !== 'off' && !!store.get('verth-pk') && passkeySupported();
const isUnlocked = (uid) => { try { return sessionStorage.getItem('verth-unlocked') === uid; } catch { return true; } };
function markUnlocked(uid) { try { sessionStorage.setItem('verth-unlocked', uid); } catch {} }
function relock() { try { sessionStorage.removeItem('verth-unlocked'); } catch {} }
const tokenUid = (t) => { try { return JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).uid || ''; } catch { return ''; } };

function renderAppLock(note = '') {
  const u = S.user, last = store.get('verth-me') || store.get('verth-last') || {};
  const first = String(last.name || u?.displayName || '').trim().split(/\s+/)[0];
  const pk = passkeySupported() && !!store.get('verth-pk');
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth applock">
    <div class="lock-hero">${pk ? ICON.finger : ICON.lock}</div>
    <h1>${first ? `Welcome back, ${esc(first)}` : 'Welcome back'}</h1>
    <p class="muted">Verth is locked to keep your circle, chats and payments private. ${pk ? 'Use your fingerprint or face to open it.' : 'We’ll email you a 6-digit code to open it.'}</p>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    <p class="err" id="l-err" role="alert"></p>
    ${pk && !S.lockEmail ? `<button class="btn primary big" data-act="unlock-pk">${ICON.finger}Unlock with fingerprint / face</button>
      <button class="btn ghost" data-act="unlock-email">Use an email code instead</button>`
    : `<form data-form="unlock-email" class="stack" novalidate>
        <p class="lock-mail">${ICON.mail}<span>Code goes to <b>${esc(maskEmail(u?.email))}</b></span></p>
        <button class="btn primary big" type="submit">Email me a code</button>
      </form>
      ${pk ? '<button class="link" data-act="unlock-back">Use fingerprint / face instead</button>' : ''}`}
    <div class="links"><button class="link" data-act="signout">Not you? Sign out</button></div>
  </div></div>`);
  S.screen = 'applock';
}
function unlockDone() {
  markUnlocked(S.user.uid); S.lockEmail = false; S.screen = '';
  renderLoading('Opening your Verth…');
  afterSignIn(S.circleId || undefined).catch((e) => errorScreen(friendlyError(e)));
}
Object.assign(actions, {
  'unlock-pk': async (el) => {
    el.disabled = true; setErr('l-err', '');
    try {
      const token = await loginWithPasskey(otpApi);
      if (tokenUid(token) && tokenUid(token) !== S.user.uid) throw Object.assign(new Error('That fingerprint belongs to a different Verth account.'), { otp: true });
      unlockDone();
    } catch (e) { el.disabled = false; setErr('l-err', e?.otp ? e.message : passkeyError(e)); }
  },
  'unlock-email': () => { S.lockEmail = true; renderAppLock(); },
  'unlock-back': () => { S.lockEmail = false; renderAppLock(); },
  'applock-toggle': async (el) => {
    const wasOn = appLockOn();
    if (!wasOn && !(store.get('verth-pk') && passkeySupported())) {
      if (!passkeySupported()) return toast('App lock needs fingerprint or face unlock, which this browser doesn’t support.');
      el.disabled = true;
      try { await registerPasskey(payApi, deviceLabel()); store.set('verth-pk', 1); S.passkeys = null; }
      catch (e) { el.disabled = false; return toast(passkeyError(e)); }
    }
    const on = !wasOn; store.set('verth-applock', on ? null : 'off'); if (on) markUnlocked(S.user.uid); toast(on ? 'App lock is on. Verth will ask for your fingerprint or face each time it opens.' : 'App lock is off on this device.', 'ok'); rerender(); },
});
Object.assign(forms, {
  'unlock-email': async (f) => {
    busy(f, true); setErr('l-err', '');
    // Already signed in: the sign-in itself proves this isn't a robot, so no robot check here.
    try { S.authMode = 'login'; S.lockEmail = false; await sendCode(S.user.email, { reauth: true }, await S.user.getIdToken()); renderCode('Enter the code to unlock Verth.'); }
    catch (e) { busy(f, false); setErr('l-err', friendlyError(e)); }
  },
});
// Lock again after 5 minutes in the background.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (S.user && hiddenAt && Date.now() - hiddenAt > 5 * 60e3 && appLockOn() && !['code', 'applock', 'auth', 'phone', 'lock'].includes(S.screen)) {
    relock(); stopListeners(); renderAppLock();
  }
  hiddenAt = 0;
});

/* ---------- profile: photo, plan badge, history and account ---------- */
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const photoOf = (x) => (PHOTO_RE.test(x?.photo || '') && x.photo.length <= 80000 ? x.photo : '');
// A round picture, or initials when there's no photo.
const ava = (x, cls = '') => { const ph = photoOf(x); return ph ? `<span class="avatar ph ${cls}"><img src="${ph}" alt=""></span>` : `<span class="avatar ${cls}">${initials(x?.name)}</span>`; };
const BADGE_IC = {
  personal: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
  family: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-7.5-10.4A4.3 4.3 0 0112 7.8a4.3 4.3 0 017.5 2.8C19.5 16.4 12 21 12 21z"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4z"/><rect x="3" y="19.2" width="18" height="2" rx="1"/></svg>',
  trial: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
};
// The best plan this person has: their own, or a paid circle they're in.
function badgeOf() {
  if (S.profile?.plan === 'personal' && S.profile?.billing && ['active', 'authenticated', 'pending'].includes(S.profile.billing.status)) return ['personal', 'Personal'];
  const plans = [S.circle?.plan, ...Object.values(S.circles || {}).map((c) => c.plan)];
  if (plans.includes('team')) return ['team', 'Team'];
  if (plans.includes('family')) return ['family', 'Family'];
  if (S.profile?.plan === 'personal') return ['personal', 'Personal'];
  if (inTrial()) return ['trial', 'Free trial'];
  return ['free', 'Free'];
}
function headAvatar() {
  const [k, label] = badgeOf(), me0 = { name: S.profile?.name || S.user?.displayName, photo: S.profile?.photo };
  return `<button class="me-btn b-${k}" data-act="profile-open" aria-label="Your profile (${label} plan)">${ava(me0)}${BADGE_IC[k] ? `<i class="me-badge">${BADGE_IC[k]}</i>` : ''}</button>`;
}

// Scam-check history stays on this phone only (Verth never stores what people check).
const histKey = () => `verth-scans:${S.user?.uid || ''}`;
const scanHist = () => { const h = store.get(histKey()); return Array.isArray(h) ? h : []; };
function logScan(r, text) {
  const label = r.kind === 'link' ? (r.host || r.normalized || '') : r.kind === 'phone' ? (r.normalized || '') : r.kind === 'image' ? 'Photo or screenshot' : String(text || '').replace(/\s+/g, ' ').slice(0, 70);
  const h = [{ k: r.kind, v: r.verdict, l: label.slice(0, 80), fp: r.fp || '', at: Date.now() }, ...scanHist()].slice(0, 100);
  store.set(histKey(), h);
}

function viewProfile() {
  const p = S.profile || {}, [k, label] = badgeOf(), hist = scanHist(), c = countryBy(p.country || 'IN');
  const since = p.createdAt ? new Date(tsMs(p.createdAt)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
  const mineChecks = (S.checks || []).filter((x) => x.fromUid === S.user.uid || x.toUid === S.user.uid);
  const caught = hist.filter((x) => x.v === 'danger').length;
  const badge = k === 'trial' ? `✨ Free trial · ${trialDaysLeft() <= 1 ? 'last day' : `${trialDaysLeft()} days left`}` : k === 'free' ? 'Free plan' : `${label} member`;
  const kindName = { message: 'Message', link: 'Link', phone: 'Number', job: 'Job offer', image: 'Photo' };
  const vName = { danger: ['bad', 'Scam'], caution: ['wait', 'Careful'], clear: ['ok', 'No flags'] };
  return `<section class="pf-hero b-${k}">
      <div class="pf-ava">${ava({ name: p.name, photo: p.photo }, 'xl')}${BADGE_IC[k] ? `<i class="me-badge big">${BADGE_IC[k]}</i>` : ''}
        <label class="pf-cam" title="Change photo">${ICON.camera}<input id="pf-photo" type="file" accept="image/*" class="sr-file" data-keep="no" aria-label="Change your profile photo"></label></div>
      <h1>${esc(p.name || '')}</h1>
      <p class="pf-mail">${esc(S.user.email)}</p>
      <span class="pf-badge b-${k}">${BADGE_IC[k] || ''}${badge}</span>
      <div class="pf-marks">
        <span>✓ Email verified</span>
        ${phoneOk() ? '<span>✓ Mobile verified</span>' : p.phone ? `<span class="dim">${esc(fmtPhone(p.phone))}</span>` : ''}
        ${store.get('verth-pk') ? '<span>✓ Fingerprint login</span>' : ''}
        <span>${c.flag} ${esc(c.name)}</span>
        ${since ? `<span>Member since ${since}</span>` : ''}
      </div>
      ${photoOf(p) ? '<button class="link pf-rm" data-act="photo-remove">Remove photo</button>' : '<p class="pf-hint">Tap the camera to add your photo.</p>'}
    </section>
    <section class="pf-stats">
      <div><b>${hist.length}</b><span>Scam checks</span></div>
      <div class="bad"><b>${caught}</b><span>Scams caught</span></div>
      <div><b>${guardScore()}<small>/10</small></b><span>Phone safety today</span></div>
      <div><b>${mineChecks.length}</b><span>Verify checks</span></div>
    </section>
    ${k === 'free' || k === 'trial' ? `<section class="pf-up"><div><b>${k === 'trial' ? 'Enjoying everything unlimited?' : 'Get the full Verth'}</b><span>Unlimited checks, chat and payments, and a ${BADGE_IC.personal} badge on your profile.</span></div><button class="btn gold" data-act="${S.circle ? 'tab' : 'trial-plans'}" data-tab="plan">See plans</button></section>` : ''}
    <section class="card"><div class="split"><h2>Scam check history</h2>${hist.length ? '<button class="link small" data-act="hist-clear">Clear</button>' : ''}</div>
      <p class="muted small">${ICON.lock} Kept only on this phone. Verth’s servers never see what you check.</p>
      ${hist.length ? `<ul class="list sh-list">${hist.slice(0, 30).map((x) => `<li><span class="sh-k">${kindName[x.k] || 'Check'}</span><span class="grow"><b>${esc(x.l || '—')}</b><span class="muted small">${ago(x.at)}</span></span><span class="pill ${vName[x.v]?.[0] || 'wait'}">${vName[x.v]?.[1] || ''}</span></li>`).join('')}</ul>` : '<p class="muted">No checks yet. Anything you check in Scam check appears here.</p>'}
      <button class="btn ghost small" data-act="${S.circle ? 'tab' : 'profile-close'}" data-tab="scan">Check something</button></section>
    ${S.circle ? `<section class="card"><div class="split"><h2>Verification history</h2><button class="link small" data-act="tab" data-tab="log">Full log</button></div>
      ${mineChecks.length ? `<ul class="list">${mineChecks.slice(0, 8).map(logRow).join('')}</ul>` : '<p class="muted">No checks with your circle yet.</p>'}</section>
      ${payHistoryCard()}` : ''}
    <section class="card"><h2>Your circles</h2>
      ${Object.keys(S.circles || {}).length ? `<ul class="list">${Object.entries(S.circles).map(([id, ci]) => `<li><span class="avatar">${initials(ci.name)}</span><span class="grow"><b>${esc(ci.name)}</b><span class="muted small">${ci.type === 'family' ? 'Family' : 'Organisation'} · ${esc((PLANS[ci.plan] || PLANS.free).name)} plan${ci.domain ? ' · Verified company' : ''}</span></span></li>`).join('')}</ul>` : '<p class="muted">You’re not in a circle yet.</p>'}</section>
    ${accountCard()}`;
}

async function setProfilePhoto(file) {
  if (!file || !/^image\//.test(file.type)) return toast('Choose a photo.', 'bad');
  try {
    const img = await createImageBitmap(file), side = Math.min(img.width, img.height);
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    cv.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
    let url = cv.toDataURL('image/jpeg', 0.82);
    if (url.length > 70000) url = cv.toDataURL('image/jpeg', 0.6);
    if (!PHOTO_RE.test(url) || url.length > 80000) throw new Error('size');
    await savePhoto(url);
    toast('Profile photo updated.', 'ok');
  } catch { toast('Couldn’t use that photo. Try another one.', 'bad'); }
}
async function savePhoto(url) {
  const b = writeBatch(db);
  b.update(doc(db, 'users', S.user.uid), { photo: url });
  // People in your circles see it next to your name.
  for (const cid of S.profile?.circles || []) if (S.circles?.[cid]) b.update(doc(db, 'circles', cid, 'members', S.user.uid), { photo: url });
  await b.commit();
  S.profile = { ...S.profile, photo: url };
  try { if (url) localStorage.setItem('verth-photo', url); else localStorage.removeItem('verth-photo'); } catch {}
  rerender();
}
Object.assign(actions, {
  'profile-open': () => { if (S.circle) { if (S.chatWith) closeChat(); S.tab = 'profile'; renderMain(); } else { S.profileOpen = true; S.guardOpen = false; renderScanView(); } window.scrollTo(0, 0); },
  'profile-close': () => { S.profileOpen = false; S.soloTab = 'scan'; renderScanView(); },
  'photo-remove': async () => { try { await savePhoto(null); toast('Photo removed.'); } catch (e) { toast(friendlyError(e), 'bad'); } },
  'hist-clear': () => { store.set(histKey(), []); rerender(); },
});

/* ---------- sign-up step: lock the account to this phone (passkey) ---------- */
// Free, and stronger than SMS: email proves the inbox, the fingerprint / face proves the person
// holding this phone. It can't be read out to a scammer or used from another phone.
function afterPhone() {
  if (passkeySupported() && !store.get('verth-pk')) { S.pkTried = 0; return renderLockStep(); }
  return renderWelcome();
}
function renderLockStep(err = '') {
  const n = STEP_NAMES().indexOf('Fingerprint') + 1;
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth lock-step">
    ${STEPS3(n)}
    <div class="lock-hero">${ICON.finger}</div>
    <h1>Lock Verth to your phone</h1>
    <p class="muted">Use your fingerprint or face to protect your account. Even if someone gets your email, they can’t open your Verth without <b>you</b> and <b>this phone</b>.</p>
    <ul class="w-ticks small-ticks">
      <li>${ICON.ok}<span>Your fingerprint or face never leaves your phone. Verth only gets a secure key.</span></li>
      <li>${ICON.ok}<span>Next time, log in with one touch. No codes to type.</span></li>
      <li>${ICON.ok}<span>Stronger than SMS codes: nobody can trick you into reading it out.</span></li>
    </ul>
    <p class="err" id="l-err" role="alert">${esc(err)}</p>
    <button class="btn primary big" data-act="lock-on">${ICON.finger}Turn on fingerprint / face</button>
    ${S.pkTried ? '<div class="links"><button class="link" data-act="lock-skip">Continue without it (less secure)</button></div>' : ''}
    <p class="muted small">Your phone will ask for your fingerprint, face or screen lock. If it asks you to set a screen lock first, do that, then try again.</p>
  </div></div>`);
  S.screen = 'lock';
}
Object.assign(actions, {
  'lock-on': async (el) => {
    el.disabled = true;
    try {
      await registerPasskey(payApi, deviceLabel());
      store.set('verth-pk', 1);
      toast('Your account is now locked to your fingerprint / face.', 'ok');
      renderWelcome();
    } catch (e) { S.pkTried = (S.pkTried || 0) + 1; renderLockStep(passkeyError(e)); }
  },
  'lock-skip': () => renderWelcome(),
});

/* ---------- mobile number check (SMS) ---------- */
let smsOnP = null;
function smsEnabled() {
  if (!PAY_API) return Promise.resolve(false);
  return (smsOnP ||= otpApi('/phone/status', {}).then((j) => (S.smsOn = !!j.enabled), () => (S.smsOn = false)).then((on) => {
    const st = document.querySelector('.steps3'); // show the extra step on a sign-up page that's already open
    if (st && on && st.querySelectorAll('li').length !== STEP_NAMES().length) { const n = st.querySelectorAll('li.done').length + 1; st.outerHTML = STEPS3(n); }
    return on;
  }));
}
const phoneOk = () => !!S.profile?.phoneVerified && S.profile.phoneVerified === S.profile.phone;
// SMS checks only cover Indian numbers for now.
const smsApplies = () => /^\+91\d{10}$/.test(S.profile?.phone || '');
const fmt10 = (p) => `${p.slice(0, 5)} ${p.slice(5)}`;
function startPhone(flow) { Object.assign(S, { phoneFlow: flow, smsSentTo: null, smsFailed: false }); renderPhone(); }

function renderPhone(note = '') {
  const flow = S.phoneFlow, sent = S.smsSentTo, p = sent || String(S.profile?.phone || '').replace(/^\+91/, '');
  paint(`<div class="shell narrow">${brand}
  <div class="panel auth">
    ${flow === 'signup' ? STEPS3(3) : ''}
    <div class="state-icon mail">${ICON.phone}</div>
    <h1>Verify your mobile</h1>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}
    ${sent ? `<p class="muted">We sent a 6-digit code by SMS to <b>+91 ${esc(fmt10(sent))}</b>. It works for 10 minutes.</p>
      <form data-form="sms-code" class="stack" novalidate>
        <label>6-digit code<input id="m-code" class="otp" data-keep="no" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••" autofocus></label>
        <p class="err" id="m-err" role="alert"></p>
        <button class="btn primary big" type="submit">Verify my mobile</button>
      </form>
      <div class="links"><button type="button" class="link" data-act="sms-resend" id="m-resend" disabled>Send a new code</button><button type="button" class="link" data-act="sms-change">Change number</button></div>`
    : `<p class="muted">${flow === 'signup' ? 'Last step. ' : ''}Every Indian SIM is registered with ID, so a verified mobile number makes your Verth account much harder to fake. We’ll send a 6-digit code by SMS.</p>
      <form data-form="sms-send" class="stack" novalidate>
        <label>Mobile number<span class="phone-in"><span>+91</span><input id="m-phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" value="${esc(p)}" placeholder="98765 43210"></span></label>
        <p class="err" id="m-err" role="alert"></p>
        <button class="btn primary big" type="submit">Send SMS code</button>
      </form>`}
    ${S.smsFailed || flow === 'account' ? `<div class="links"><button type="button" class="link" data-act="sms-later">${flow === 'account' ? 'Back' : 'Do this later'}</button></div>` : ''}
    <p class="muted small">Never share this code with anyone. Verth will never call or message you to ask for it.</p>
  </div></div>`);
  S.screen = 'phone';
  const btn = document.getElementById('m-resend');
  if (btn) {
    const t = () => { const left = Math.ceil((S.smsResendAt - Date.now()) / 1000); btn.disabled = left > 0; btn.textContent = left > 0 ? `Send a new code in ${left}s` : 'Send a new code'; if (left <= 0) clearInterval(resendTimer); };
    t(); resendTimer = setInterval(t, 1000);
  }
  const input = document.getElementById('m-code');
  input?.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); if (input.value.length === 6) input.form.requestSubmit(); });
}
async function smsSend(phone) {
  await payApi('/phone/send', { phone });
  Object.assign(S, { smsSentTo: phone, smsResendAt: Date.now() + 45000, smsFailed: false });
}
function phoneDone() {
  const flow = S.phoneFlow; S.phoneFlow = null; S.screen = '';
  if (flow === 'signup') return afterPhone();
  if (flow === 'account' && S.circle) { S.tab = 'plan'; return renderMain(); }
  return afterSignIn();
}
// Admins see a ✓ next to verified numbers when approving people.
async function markContactsVerified() {
  const phone = S.profile?.phoneVerified;
  await Promise.all((S.profile?.circles || []).map((cid) => setDoc(doc(db, 'circles', cid, 'contacts', S.user.uid), { phone, v: true }).catch(() => {})));
}
Object.assign(actions, {
  'sms-change': () => { S.smsSentTo = null; renderPhone(); },
  'sms-later': () => { S.smsLater = true; phoneDone(); },
  'sms-resend': async (el) => {
    el.disabled = true; setErr('m-err', '');
    try { await smsSend(S.smsSentTo); renderPhone('A new code is on its way. Use the newest SMS.'); }
    catch (e) { setErr('m-err', e.message); if (e.status === 502) { S.smsFailed = true; renderPhone(e.message); } }
  },
  'verify-mobile': () => startPhone('account'),
});
Object.assign(forms, {
  'sms-send': async (f) => {
    const phone = f.querySelector('#m-phone').value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (!PHONE_RE.test(phone)) return setErr('m-err', 'Please type a 10-digit Indian mobile number.');
    busy(f, true); setErr('m-err', '');
    try { await smsSend(phone); renderPhone(); }
    catch (e) {
      busy(f, false);
      if (e.status === 502 || e.status === 503) { S.smsFailed = true; return renderPhone(`${e.message} You can verify your mobile later from your profile.`); }
      setErr('m-err', e.message);
    }
  },
  'sms-code': async (f) => {
    const code = f.querySelector('#m-code').value.replace(/\D/g, '');
    if (code.length !== 6) return setErr('m-err', 'Enter all 6 digits from the SMS.');
    busy(f, true); setErr('m-err', '');
    try {
      const r = await payApi('/phone/verify', { code });
      S.profile = { ...S.profile, phone: r.phone, phoneVerified: r.phone };
      markContactsVerified();
      toast('Mobile number verified.', 'ok');
      phoneDone();
    } catch (e) {
      busy(f, false); setErr('m-err', e.message);
      const input = f.querySelector('#m-code'); input.value = ''; input.focus();
    }
  },
});

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); }
});
root.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f && forms[f.dataset.form]) { e.preventDefault(); forms[f.dataset.form](f); }
});
// Private chat: no copying text out, no long-press menus, and the chat hides when Verth isn't in front
// (so it doesn't show in the recent-apps preview). Browsers can't block screenshots; the Android app will.
const inChatBox = (n) => !!(n && (n.nodeType === 1 ? n : n.parentElement)?.closest?.('.chat-scroll'));
document.addEventListener('copy', (e) => { if (inChatBox(document.getSelection()?.anchorNode)) { e.preventDefault(); toast('Copying is turned off in private chats.'); } });
document.addEventListener('contextmenu', (e) => { if (inChatBox(e.target)) e.preventDefault(); });
document.addEventListener('visibilitychange', () => document.body.classList.toggle('away', document.hidden));
window.addEventListener('blur', () => document.body.classList.add('away'));
window.addEventListener('focus', () => document.body.classList.remove('away'));
root.addEventListener('keydown', (e) => {
  if (e.target.id === 'c-text' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && isPhone() === false) {
    e.preventDefault(); e.target.form?.requestSubmit();
  }
});
root.addEventListener('input', (e) => {
  if (e.target.id === 'c-text') { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }
});
root.addEventListener('change', (e) => {
  if (e.target.dataset?.dial) syncDial(e.target);
  if (e.target.id === 'robot') robotTick(e.target.checked);
  if (e.target.id === 'pf-photo' && e.target.files?.[0]) setProfilePhoto(e.target.files[0]);
  if (e.target.id === 'c-file' && e.target.files?.[0]) {
    const f = e.target.files[0], t = document.getElementById('c-text');
    if (t) t.placeholder = `Add a note to “${f.name.slice(0, 30)}”, then send`;
    document.querySelector('.composer')?.classList.add('has-file');
  }
  if (e.target.id === 'circle-switch') openCircle(e.target.value);
  if (e.target.id === 'code-for') { S.codeFor = e.target.value; lastCodeKey = ''; tick(); }
  if (e.target.id === 's-image') setPhoto(e.target.files?.[0]);
  if (e.target.id === 'xray-file') runXray(e.target.files?.[0]);
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
    if (!S.circle) { S.soloTab = 'scan'; renderScanOnly(); window.scrollTo(0, 0); return; }
    to = 'scan';
  }
  if (to === 'guard') return actions['guard-open']();
  if (!S.circle) { S.soloTab = ['verify', 'chat', 'circle', 'plan', 'profile', 'home'].includes(to) ? to : 'home'; renderScanOnly(); window.scrollTo(0, 0); return; }
  S.tab = to; S.confirmRemove = null; if (to === 'verify') S.codeResult = null;
  renderMain(); window.scrollTo(0, 0);
}

// Optional Gemini answers (Firebase AI Logic). Off unless switched on in config.js,
// and only with App Check, so only the real Verth site can use the project's AI quota.
function makeAI() { return AI_HELPER.enabled ? makeServerAI(PAY_API) : null; }
const helper = mountHelper({ go: helperGo, ai: makeAI(), raised: true });
bindVideos();

/* ---------- routing ---------- */
function route() {
  const u = S.user;
  if (!u) {
    stopListeners(); Object.assign(S, { circle: null, circleId: null, profile: null, keys: null, circles: {}, pending: [] });
    if (S.screen === 'auth' || S.screen === 'code') return; // already showing; don't wipe what they typed
    S.authMode ||= params.get('mode') === 'signup' ? 'signup' : 'login';
    return renderAuth(SHARED ? 'Log in or create a free account, and Verth will check what you shared.' : '');
  }
  // Older accounts that never confirmed their email: confirm it with a code now.
  if (!u.emailVerified) {
    S.otpEmail = u.email;
    signOut(auth).catch(() => {});
    return sendCode(u.email).then(() => renderCode('Please confirm your email once.'), () => renderAuth());
  }
  // App lock: a fresh sign-in counts as unlocking; reopening Verth asks again.
  if (appLockOn() && !isUnlocked(u.uid)) {
    if (S.authFlow) markUnlocked(u.uid);
    else if (S.screen !== 'applock') return renderAppLock();
    else return;
  }
  if (!S.circle && S.screen !== 'phone' && S.screen !== 'lock') renderLoading(S.authFlow === 'code' ? 'Signing you in…' : S.authFlow?.startsWith('google') ? 'Connecting your Google account…' : 'Opening your Verth…');
  afterSignIn().catch((e) => errorScreen(friendlyError(e)));
}

if ('serviceWorker' in navigator && !EMU) {
  // When a new version of Verth is published, switch to it straight away (only right after opening,
  // and never in the middle of typing a code).
  const hadOld = !!navigator.serviceWorker.controller, opened = Date.now();
  let switched = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadOld && !switched && Date.now() - opened < 20000 && !['code', 'phone', 'lock'].includes(S.screen)) { switched = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

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
if (EMU) window.__verth = { S, inviteLink };
