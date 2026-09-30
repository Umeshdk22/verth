import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, GoogleAuthProvider, signInWithPopup, signOut, updateProfile,
  sendPasswordResetEmail, connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp, writeBatch, arrayUnion, increment,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { firebaseConfig, PLANS, CHECK_TTL_SECONDS } from './config.js';
import { randomSecret, totp, verifyTotp, secondsLeft } from './totp.js';

/* ---------- setup ---------- */
const params = new URLSearchParams(location.search);
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && params.has('emu');
const cfg = EMU ? { apiKey: 'demo-key', authDomain: 'demo-verth.firebaseapp.com', projectId: 'demo-verth', appId: 'demo' } : firebaseConfig;
const CONFIGURED = EMU || !String(cfg.apiKey).includes('REPLACE');
const APP_URL = 'https://umeshdk22.github.io/verth/app.html';

const root = document.getElementById('app');
let auth, db;
if (CONFIGURED) {
  const app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  if (EMU) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

const S = {
  user: null, profile: null, circleId: null, circle: null, circles: {},
  members: [], checks: [], tab: 'home', tourStep: 0, verifyMode: 'push',
  lastSentId: null, codeResult: null, seen: new Set(), unsubs: [], booted: false,
};

/* ---------- helpers ---------- */
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tsMs = (t) => (t instanceof Timestamp ? t.toMillis() : typeof t === 'number' ? t : t?.seconds ? t.seconds * 1000 : Date.now());
const me = () => S.members.find((m) => m.uid === S.user?.uid);
const memberName = (uid) => S.members.find((m) => m.uid === uid)?.name || 'Someone';
const plan = () => PLANS[S.circle?.plan || 'free'] || PLANS.free;
const fmtCode = (c) => (c ? c.slice(0, 3) + ' ' + c.slice(3) : '--- ---');
const fmtInvite = (c) => (c ? c.slice(0, 3) + '-' + c.slice(3) : '');

function fmtTime(t) {
  const d = new Date(tsMs(t));
  const now = new Date();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today ' + hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + hm;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm;
}

function makeInviteCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(r, (b) => A[b % A.length]).join('');
}

function friendlyError(e) {
  const c = e?.code || '';
  const map = {
    'auth/invalid-credential': 'That email and password don’t match. Check them, or reset your password.',
    'auth/wrong-password': 'That email and password don’t match.',
    'auth/user-not-found': 'No account uses that email yet. Create one instead.',
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use a password with at least 8 characters.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/network-request-failed': 'You seem to be offline. Check your connection.',
    'permission-denied': 'Verth couldn’t save that. Refresh the page and try again.',
  };
  return map[c] || e?.message || 'Something went wrong. Try again.';
}

let toastTimer;
function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3800);
}

// Re-render without losing what the person was typing.
function paint(html) {
  const keep = {};
  root.querySelectorAll('input[id],select[id],textarea[id]').forEach((el) => (keep[el.id] = el.value));
  const focused = document.activeElement?.id;
  root.innerHTML = html;
  for (const [id, v] of Object.entries(keep)) {
    const el = document.getElementById(id);
    if (el && el.type !== 'password' && v !== '' && el.dataset.keep !== 'no') el.value = v;
  }
  if (focused) document.getElementById(focused)?.focus();
  tick();
}

const ICON = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.6.2 4.4 1.8 5 4.5"/></svg>',
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/><path d="M8 7h7"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  google: '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 01-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0012 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 010-4.2V7.1H2.2a11 11 0 000 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 002.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
};

const brand = `<a class="brand" href="./">${ICON.shield}<span>Verth</span></a>`;

/* ---------- auth screens ---------- */
function renderNotConfigured() {
  paint(`<div class="shell narrow">${brand}
    <div class="panel"><h1>Accounts open soon</h1>
    <p class="muted">Verth sign-up is being connected. Meanwhile, you can try the full interactive demo.</p>
    <a class="btn primary" href="demo.html">Try the demo</a></div></div>`);
}

function renderAuth(mode = 'signin', note = '') {
  const signup = mode === 'signup', reset = mode === 'reset';
  paint(`<div class="shell narrow">${brand}
  <div class="panel">
    <h1>${signup ? 'Create your Verth account' : reset ? 'Reset your password' : 'Sign in to Verth'}</h1>
    <p class="muted">${signup ? 'Free for up to 5 people. We’ll send a link to confirm your email.' : reset ? 'We’ll email you a link to choose a new password.' : 'Check requests with the real person before you act.'}</p>
    ${note ? `<div class="note">${note}</div>` : ''}
    ${reset ? '' : `<button class="btn google" type="button" data-act="google">${ICON.google}Continue with Google</button><div class="or"><span>or use email</span></div>`}
    <form data-form="${mode}" class="stack" novalidate>
      ${signup ? '<label>Your name<input id="a-name" autocomplete="name" required placeholder="Umesh Kumar"></label>' : ''}
      <label>Email<input id="a-email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
      ${reset ? '' : `<label>Password<input id="a-pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="8" placeholder="At least 8 characters"></label>`}
      <p class="err" id="a-err" role="alert"></p>
      <button class="btn primary" type="submit">${signup ? 'Create account' : reset ? 'Send reset link' : 'Sign in'}</button>
    </form>
    <div class="links">
      ${signup ? '<button type="button" class="link" data-act="to-signin">I already have an account</button>'
        : reset ? '<button type="button" class="link" data-act="to-signin">Back to sign in</button>'
        : '<button type="button" class="link" data-act="to-signup">Create a free account</button><button type="button" class="link" data-act="to-reset">Forgot password?</button>'}
    </div>
  </div>
  <p class="foot">New here? <a href="demo.html">Try the demo</a> first, no account needed.</p></div>`);
}

function renderVerifyEmail(note = '') {
  paint(`<div class="shell narrow">${brand}
  <div class="panel">
    <div class="state-icon wait">${ICON.wait}</div>
    <h1>Confirm your email</h1>
    <p class="muted">We sent a link to <b>${esc(S.user.email)}</b>. Open it to confirm this address is yours, then come back here.</p>
    <p class="muted small">Can’t find it? Check spam or promotions.</p>
    ${note ? `<div class="note">${note}</div>` : ''}
    <button class="btn primary" data-act="verified">I’ve confirmed my email</button>
    <button class="btn ghost" data-act="resend">Send the link again</button>
    <div class="links"><button class="link" data-act="signout">Use a different account</button></div>
  </div></div>`);
}

/* ---------- onboarding tour ---------- */
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
    <li><b>Their phone asks them</b> “Did you send this?” They tap Yes or No, and you see the answer in seconds.</li></ol>
    <p class="muted">On a live call, ask for their <b>Verth code</b> instead. It changes every 30 seconds and only their real phone shows it.</p>`,
  () => `<h1>Who do you want to protect?</h1><p class="muted">You can add more circles later.</p>
    <div class="choose">
      <button class="choice" data-act="tour-choose" data-type="org"><b>My organisation</b><span>Accounts, HR, IT help desk and managers verify payment, bank and password requests.</span></button>
      <button class="choice" data-act="tour-choose" data-type="family"><b>My family</b><span>Parents, children and grandparents verify “I lost my phone, send money” and emergency calls.</span></button>
      <button class="choice" data-act="tour-choose" data-type="join"><b>I have an invite code</b><span>Someone already set up a circle and invited you.</span></button>
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
  </div></div>`);
}

function renderSetup(type) {
  const fam = type === 'family', join = type === 'join';
  paint(`<div class="shell narrow">${brand}<div class="panel">
    ${join ? `<h1>Join a circle</h1><p class="muted">Enter the 6-character code the circle owner shared with you.</p>
      <form data-form="join" class="stack" novalidate>
        <label>Invite code<input id="j-code" required maxlength="7" placeholder="ABC-123" autocapitalize="characters" class="mono"></label>
        <label>How others know you<input id="j-title" required placeholder="e.g. Accounts, or Son"></label>
        <p class="err" id="s-err" role="alert"></p>
        <button class="btn primary" type="submit">Join circle</button></form>`
      : `<h1>${fam ? 'Set up your family circle' : 'Set up your organisation'}</h1>
      <p class="muted">${fam ? 'Everyone in the circle can check requests with each other.' : 'Invite the people who ask for and approve payments, bank changes and access.'}</p>
      <form data-form="create" class="stack" novalidate>
        <input type="hidden" id="c-type" value="${fam ? 'family' : 'org'}">
        <label>${fam ? 'Family name' : 'Organisation name'}<input id="c-name" required maxlength="60" placeholder="${fam ? 'The Sharma family' : 'Nirmaan Infra'}"></label>
        <label>Your role${fam ? ' in the family' : ''}<input id="c-title" required maxlength="40" placeholder="${fam ? 'e.g. Dad' : 'e.g. Finance head'}"></label>
        <p class="err" id="s-err" role="alert"></p>
        <button class="btn primary" type="submit">Create circle</button></form>`}
    <div class="links"><button class="link" data-act="setup-back">Back</button></div>
  </div></div>`);
}

/* ---------- main app ---------- */
const TABS = [
  ['home', 'Home', ICON.home], ['verify', 'Verify', ICON.check], ['circle', 'Circle', ICON.people],
  ['log', 'Log', ICON.log], ['guide', 'Guide', ICON.book], ['plan', 'Plan', ICON.star],
];

function isExpired(c) { return c.status === 'pending' && tsMs(c.expiresAt) < Date.now(); }
function statusOf(c) { return isExpired(c) ? 'expired' : c.status; }
const STATUS = {
  pending: ['wait', 'Waiting'], confirmed: ['ok', 'Confirmed'], denied: ['bad', 'Denied'], expired: ['wait', 'No answer'],
  'code-match': ['ok', 'Code matched'], 'code-mismatch': ['bad', 'Code wrong'],
};
const pill = (c) => { const [k, t] = STATUS[statusOf(c)] || ['wait', c.status]; return `<span class="pill ${k}">${t}${c.reported ? ' · reported' : ''}</span>`; };

function monthChecks() {
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  return S.checks.filter((c) => c.fromUid === S.user.uid && tsMs(c.createdAt) >= start.getTime()).length;
}

function renderMain() {
  if (!S.circle) return;
  const circles = Object.entries(S.circles);
  const body = { home: viewHome, verify: viewVerify, circle: viewCircle, log: viewLog, guide: viewGuide, plan: viewPlan }[S.tab]();
  paint(`<div class="app">
    <header class="top">${brand}
      <div class="circle-pick">
        ${circles.length > 1
          ? `<select id="circle-switch" aria-label="Switch circle" data-keep="no">${circles.map(([id, c]) => `<option value="${id}" ${id === S.circleId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`
          : `<b>${esc(S.circle.name)}</b>`}
        <span class="tag">${S.circle.type === 'family' ? 'Family' : 'Organisation'} · ${plan().name}</span>
      </div>
    </header>
    <main class="content">${body}</main>
    <nav class="tabs" aria-label="Sections">${TABS.map(([id, label, ic]) => `<button class="${S.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" aria-current="${S.tab === id ? 'page' : 'false'}">${ic}<span>${label}</span></button>`).join('')}</nav>
  </div>`);
}

function incomingCard(c) {
  return `<div class="incoming">
    <div class="eyebrow">Verth check · ${esc(c.channel)}</div>
    <div class="q">Did you ask ${esc(c.fromName)} to <b>${esc(c.summary)}</b>?</div>
    <p class="muted small">${esc(c.fromName)} received this request in your name and is waiting for your answer. <span data-countdown="${tsMs(c.expiresAt)}"></span></p>
    <div class="row2"><button class="btn bad" data-act="answer" data-id="${c.id}" data-v="denied">No, not me</button>
    <button class="btn ok" data-act="answer" data-id="${c.id}" data-v="confirmed">Yes, I asked</button></div></div>`;
}

function codeCard() {
  return `<div class="codecard"><div class="ring" data-ring></div>
    <div><div class="muted small">Your Verth code</div><div class="code" data-mycode>--- ---</div>
    <div class="muted small">Read it out if someone in ${esc(S.circle.name)} asks. It changes every 30 seconds.</div></div></div>`;
}

function viewHome() {
  const mine = S.checks.filter((c) => c.toUid === S.user.uid && c.kind === 'push' && statusOf(c) === 'pending');
  const recent = S.checks.slice(0, 4);
  const used = monthChecks(), lim = plan().checksPerMonth;
  const others = S.members.filter((m) => m.uid !== S.user.uid).length;
  return `
    ${'Notification' in window && Notification.permission === 'default' ? `<div class="banner"><span>Turn on alerts so you see checks even when this tab is in the background.</span><button class="btn small" data-act="notify">Turn on</button></div>` : ''}
    ${mine.length ? mine.map(incomingCard).join('') : ''}
    ${others === 0 ? `<div class="banner accent"><span><b>Invite people to start.</b> A check needs the other person in your circle.</span><button class="btn small" data-act="tab" data-tab="circle">Invite</button></div>` : ''}
    <section class="card"><h2>Your code</h2>${codeCard()}</section>
    <section class="card"><div class="split"><h2>Check a request</h2>${lim !== Infinity ? `<span class="muted small">${used} of ${lim} free checks this month</span>` : ''}</div>
      <p class="muted">Got a message, call or email asking you to pay, share or change something? Check it first.</p>
      <div class="row gap"><button class="btn primary grow" data-act="goverify" data-mode="push">Ask on their phone</button><button class="btn ghost grow" data-act="goverify" data-mode="code">Check a code</button></div></section>
    <section class="card"><div class="split"><h2>Recent</h2><button class="link" data-act="tab" data-tab="log">See all</button></div>
      ${recent.length ? `<ul class="list">${recent.map(logRow).join('')}</ul>` : '<p class="muted">No checks yet. They’ll appear here.</p>'}</section>`;
}

function memberOptions(sel = '') {
  return S.members.filter((m) => m.uid !== S.user.uid)
    .map((m) => `<option value="${m.uid}" ${m.uid === sel ? 'selected' : ''}>${esc(m.name)}${m.title ? ' · ' + esc(m.title) : ''}</option>`).join('');
}

function viewVerify() {
  const others = S.members.filter((m) => m.uid !== S.user.uid);
  if (!others.length) return `<section class="card"><h2>Invite someone first</h2><p class="muted">You can only check requests with people in your circle. Share your invite code, and once they join you can verify with them.</p><button class="btn primary" data-act="tab" data-tab="circle">Invite people</button></section>`;
  const sent = S.lastSentId && S.checks.find((c) => c.id === S.lastSentId);
  const seg = `<div class="seg" role="tablist"><button class="${S.verifyMode === 'push' ? 'on' : ''}" data-act="vmode" data-mode="push" role="tab">Ask on their phone</button><button class="${S.verifyMode === 'code' ? 'on' : ''}" data-act="vmode" data-mode="code" role="tab">Check a code</button></div>`;
  if (S.verifyMode === 'code') {
    const r = S.codeResult;
    return `${seg}<section class="card"><h2>Check their Verth code</h2>
      <p class="muted">On a call or video? Ask the person to read out the code in their Verth app. A deepfake or impostor can’t know it.</p>
      <form data-form="code" class="stack" novalidate>
        <label>Who is the caller claiming to be?<select id="v-code-who" required>${memberOptions()}</select></label>
        <label>Code they read out<input id="v-code" inputmode="numeric" maxlength="7" placeholder="000 000" class="mono big" data-keep="no" autocomplete="off"></label>
        <p class="err" id="v-err" role="alert"></p>
        <button class="btn primary" type="submit">Check code</button></form></section>
      ${r ? `<div class="result ${r.ok ? 'ok' : 'bad'}"><div class="state-icon ${r.ok ? 'ok' : 'bad'}">${r.ok ? ICON.ok : ICON.bad}</div>
        <h2>${r.ok ? 'Code matches' : 'Code doesn’t match'}</h2>
        <p>${r.ok ? `The caller has ${esc(r.name)}’s phone. Continue with your normal approval steps.` : `The person on the call doesn’t have ${esc(r.name)}’s phone. Treat it as an impostor or deepfake. Don’t pay, share or change anything.`}</p></div>` : ''}`;
  }
  let status = '';
  if (sent) {
    const st = statusOf(sent);
    status = st === 'pending'
      ? `<div class="result wait"><div class="state-icon wait"><span class="spin"></span></div><h2>Asking ${esc(sent.toName)}…</h2><p>Sent to their phone. Don’t act on the request yet. <span data-countdown="${tsMs(sent.expiresAt)}"></span></p></div>`
      : st === 'confirmed'
        ? `<div class="result ok"><div class="state-icon ok">${ICON.ok}</div><h2>Confirmed by ${esc(sent.toName)}</h2><p>They approved it ${fmtTime(sent.answeredAt)}. Go ahead through your normal process.</p><button class="btn ghost" data-act="newcheck">New check</button></div>`
        : st === 'denied'
          ? `<div class="result bad"><div class="state-icon bad">${ICON.bad}</div><h2>${esc(sent.toName)} didn’t send this</h2><p>Don’t pay, share or reply. Someone is pretending to be them.</p>
             ${sent.reported ? '<p><b>Reported to your circle.</b></p>' : `<button class="btn bad" data-act="report" data-id="${sent.id}">Report to my circle</button>`}<button class="btn ghost" data-act="newcheck">New check</button></div>`
          : `<div class="result wait"><div class="state-icon wait">${ICON.wait}</div><h2>No answer from ${esc(sent.toName)}</h2><p>The check expired. Don’t act on the request until they confirm.</p><button class="btn ghost" data-act="newcheck">Try again</button></div>`;
    if (st === 'pending') return seg + status;
  }
  return `${seg}${status}<section class="card"><h2>Ask on their phone</h2>
    <form data-form="push" class="stack" novalidate>
      <label>Who does the request claim to be from?<select id="v-who" required>${memberOptions()}</select></label>
      <label>Where did it come from?<select id="v-channel">${['WhatsApp', 'Phone call', 'Video call', 'SMS', 'Email', 'In person', 'Other'].map((c) => `<option>${c}</option>`).join('')}</select></label>
      <label>What are they asking you to do?<input id="v-what" maxlength="200" required placeholder="e.g. pay ₹80,000 to Sharma Traders today"></label>
      <p class="err" id="v-err" role="alert"></p>
      <button class="btn primary" type="submit">Send check</button>
      <p class="muted small">They get ${Math.round(CHECK_TTL_SECONDS / 60)} minutes to answer. No answer means don’t act.</p></form></section>`;
}

function viewCircle() {
  const c = S.circle, lim = plan().maxMembers;
  const msg = `Join our Verth circle "${c.name}" so we can check payment requests, bank changes and emergency messages with each other. Open ${APP_URL} and enter code ${fmtInvite(c.inviteCode)}`;
  return `<section class="card"><h2>Invite people</h2>
    <p class="muted">${c.type === 'family' ? 'Share this code in your family WhatsApp group.' : 'Share this code with the people who request and approve payments or access.'} Anyone with the code can join, so share it only with people you trust.</p>
    <div class="invite"><span class="mono">${fmtInvite(c.inviteCode)}</span><button class="btn small" data-act="copy" data-text="${esc(fmtInvite(c.inviteCode))}">Copy code</button></div>
    <button class="btn ghost" data-act="copy" data-text="${esc(msg)}">Copy invite message</button>
    <p class="muted small">${c.memberCount || S.members.length} of ${lim} people on the ${plan().name} plan.</p></section>
  <section class="card"><h2>People in ${esc(c.name)}</h2><ul class="list people">
    ${S.members.map((m) => `<li><span class="avatar">${esc((m.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</span>
      <span class="grow"><b>${esc(m.name)}${m.uid === S.user.uid ? ' (you)' : ''}</b><span class="muted small">${esc(m.title || '')}${m.role === 'admin' ? ' · admin' : ''}</span></span></li>`).join('')}
  </ul></section>
  <section class="card"><h2>More circles</h2><p class="muted">Protect your workplace and your family separately.</p>
    <div class="row gap"><button class="btn ghost grow" data-act="setup" data-type="${c.type === 'family' ? 'org' : 'family'}">New ${c.type === 'family' ? 'organisation' : 'family'} circle</button><button class="btn ghost grow" data-act="setup" data-type="join">Join with a code</button></div></section>
`;
}

function logRow(c) {
  const who = c.fromUid === S.user.uid ? `You checked with ${esc(c.toName)}` : `${esc(c.fromName)} checked with ${c.toUid === S.user.uid ? 'you' : esc(c.toName)}`;
  return `<li><span class="grow"><b>${who}</b><span class="muted small">${esc(c.kind === 'code' ? 'Code check' : c.summary)} · ${esc(c.channel || '')} · ${fmtTime(c.createdAt)}</span></span>${pill(c)}</li>`;
}

function viewLog() {
  const paid = S.circle.plan !== 'free';
  const stopped = S.checks.filter((c) => ['denied', 'code-mismatch'].includes(c.status)).length;
  return `<section class="card"><div class="stats"><div><b>${S.checks.length}</b><span>checks</span></div><div><b>${stopped}</b><span>stopped</span></div><div><b>${S.members.length}</b><span>people</span></div></div></section>
  <section class="card"><div class="split"><h2>Verification log</h2>${paid ? '<button class="btn small" data-act="csv">Export CSV</button>' : '<button class="btn small ghost" data-act="tab" data-tab="plan">Export (paid)</button>'}</div>
  <p class="muted small">Everyone in ${esc(S.circle.name)} can see this log, so there’s a record of who approved what.</p>
  ${S.checks.length ? `<ul class="list">${S.checks.map(logRow).join('')}</ul>` : '<p class="muted">No checks yet.</p>'}</section>`;
}

function viewGuide() {
  const fam = S.circle.type === 'family';
  const org = `<section class="card"><h2>For organisations</h2><ul class="cases">
      <li><b>Accounts</b><span>A “director” on WhatsApp asks for an urgent transfer. Verify with the director before paying.</span></li>
      <li><b>HR and payroll</b><span>An employee emails asking to change their salary account. Verify with the employee.</span></li>
      <li><b>IT help desk</b><span>A caller wants a password or MFA reset. Ask for their Verth code.</span></li>
      <li><b>Vendor payments</b><span>A supplier sends “new bank details”. Verify with the colleague who owns that supplier.</span></li></ul>
    <h3>Set it up in your office</h3><ol class="how small-how"><li>Create an organisation circle.</li><li>Share the invite code with finance, HR, IT and managers.</li><li>Agree one rule: <b>no Verth check, no payment</b> above an amount you choose.</li></ol></section>`;
  const home = `<section class="card"><h2>For families and households</h2><ul class="cases">
      <li><b>“New number” scams</b><span>“Hi Papa, this is my new number, send ₹20,000.” Verify with your son before paying.</span></li>
      <li><b>“Digital arrest” calls</b><span>A fake officer says a relative is in trouble. Check with that relative, or ask for their code.</span></li>
      <li><b>OTP requests</b><span>Someone asks your child or parent for an OTP “from the family”. Verify first.</span></li>
      <li><b>Deepfake video calls</b><span>A familiar face asks for money on a video call. Ask for their Verth code.</span></li></ul>
    <h3>Set it up at home</h3><ol class="how small-how"><li>Create a family circle.</li><li>Share the code in your family WhatsApp group and help elders join.</li><li>Practise once together, so everyone knows what a check looks like.</li></ol></section>`;
  return `<section class="card"><h2>How to use Verth</h2><ol class="how">
      <li><b>Pause.</b> Urgency and secrecy are the scammer’s tools.</li>
      <li><b>Open Verify</b> and pick who the request claims to be from.</li>
      <li><b>Wait for their answer.</b> Only act on a green “Confirmed”.</li>
      <li><b>On live calls</b>, ask for their Verth code and check it.</li></ol></section>
    ${fam ? home + org : org + home}
    <section class="card"><h2>Good to know</h2><ul class="plain">
      <li>Verth never reads your WhatsApp, calls or email. You tell it what came in.</li>
      <li>A check goes only to the person’s own signed-in phone, never to the number that contacted you.</li>
      <li>If they don’t answer in time, the answer is <b>don’t act</b>.</li></ul>
    <button class="btn ghost" data-act="replay">Replay the welcome tour</button></section>`;
}

function viewPlan() {
  const cur = S.circle.plan || 'free', used = monthChecks();
  const interest = S.profile?.upgradeInterest?.plan;
  const card = (id, title, price, items, cta) => `<div class="plan ${cur === id ? 'current' : ''}"><h3>${title}</h3><div class="price">${price}</div><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>${cta}</div>`;
  const want = (id) => cur === id ? '<span class="pill ok">Current plan</span>'
    : interest === id ? '<span class="pill wait">We’ll notify you</span>'
      : `<button class="btn primary" data-act="upgrade" data-plan="${id}">Choose ${PLANS[id].name}</button>`;
  return `<section class="card"><h2>Your plan</h2><p><b>${plan().name}</b> for ${esc(S.circle.name)}.
      ${plan().checksPerMonth === Infinity ? 'Unlimited checks.' : `${used} of ${plan().checksPerMonth} checks used this month.`} ${S.circle.memberCount || S.members.length} of ${plan().maxMembers} people.</p></section>
    <div class="plans">
      ${card('free', 'Free', '₹0', ['Up to 5 people', '20 checks a month', 'Push checks and rolling codes', 'Shared log'], want('free'))}
      ${card('family', 'Family', '₹49 <small>/ month</small>', ['Up to 10 people', 'Unlimited checks', 'Help elders join', 'Log export'], want('family'))}
      ${card('team', 'Team', '₹99 <small>/ person / month</small>', ['Whole organisation', 'Unlimited checks', 'Log export for auditors', 'Admin controls and priority support'], want('team'))}
    </div>
    <p class="muted small">Paid plans open with online payment shortly. Choose one to be notified first; you won’t be charged now.</p>
    <section class="card"><h2>Account</h2><p class="muted">${esc(S.user.email)}</p><button class="btn ghost" data-act="signout">Sign out</button></section>`;
}

/* ---------- live data ---------- */
function stopListeners() { S.unsubs.forEach((u) => u()); S.unsubs = []; }

async function openCircle(cid) {
  stopListeners();
  S.circleId = cid; S.members = []; S.checks = []; S.lastSentId = null; S.codeResult = null;
  let first = true;
  S.unsubs.push(onSnapshot(doc(db, 'circles', cid), (s) => {
    if (!s.exists()) return;
    S.circle = { id: s.id, ...s.data() }; S.circles[cid] = S.circle; renderMain();
  }, (e) => toast(friendlyError(e), 'bad')));
  S.unsubs.push(onSnapshot(collection(db, 'circles', cid, 'members'), (s) => {
    S.members = s.docs.map((d) => d.data()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderMain();
  }));
  S.unsubs.push(onSnapshot(query(collection(db, 'circles', cid, 'checks'), orderBy('createdAt', 'desc'), limit(100)), (s) => {
    S.checks = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    for (const c of S.checks) {
      if (c.toUid === S.user.uid && c.kind === 'push' && statusOf(c) === 'pending' && !S.seen.has(c.id)) {
        S.seen.add(c.id);
        if (!first) alertIncoming(c);
      } else S.seen.add(c.id);
    }
    first = false;
    renderMain();
  }));
  if (S.profile.activeCircle !== cid) updateDoc(doc(db, 'users', S.user.uid), { activeCircle: cid }).catch(() => {});
}

function alertIncoming(c) {
  if (S.tab !== 'home') S.tab = 'home';
  toast(`${c.fromName} is checking a request in your name`, 'accent');
  try { navigator.vibrate?.([180, 80, 180]); } catch {}
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try { new Notification('Verth check', { body: `Did you ask ${c.fromName} to ${c.summary}?`, tag: c.id }); } catch {}
  }
}

async function loadCircles() {
  const ids = S.profile.circles || [];
  S.circles = {};
  await Promise.all(ids.map(async (id) => {
    try { const s = await getDoc(doc(db, 'circles', id)); if (s.exists()) S.circles[id] = { id, ...s.data() }; } catch {}
  }));
}

async function afterSignIn() {
  const u = S.user;
  const ref = doc(db, 'users', u.uid);
  let s = await getDoc(ref);
  if (!s.exists()) {
    await setDoc(ref, { name: u.displayName || u.email.split('@')[0], email: u.email, plan: 'free', circles: [], activeCircle: null, onboarded: false, createdAt: serverTimestamp() });
    s = await getDoc(ref);
  }
  S.profile = s.data();
  if (!S.profile.onboarded) { S.tourStep = 0; return renderTour(); }
  await loadCircles();
  const ids = Object.keys(S.circles);
  if (!ids.length) { S.tourStep = TOUR.length - 1; return renderTour(); }
  const pick = ids.includes(S.profile.activeCircle) ? S.profile.activeCircle : ids[0];
  await openCircle(pick);
}

/* ---------- actions ---------- */
const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
const busy = (form, on) => form?.querySelectorAll('button').forEach((b) => (b.disabled = on));

const actions = {
  'to-signin': () => renderAuth('signin'),
  'to-signup': () => renderAuth('signup'),
  'to-reset': () => renderAuth('reset'),
  google: async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { setErr('a-err', friendlyError(e)); }
  },
  signout: async () => { stopListeners(); await signOut(auth); },
  resend: async () => {
    try { await sendEmailVerification(S.user, { url: location.origin + location.pathname }); renderVerifyEmail('Sent. Check your inbox.'); }
    catch (e) { renderVerifyEmail(friendlyError(e)); }
  },
  verified: async () => {
    await S.user.reload();
    if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); S.user = auth.currentUser; route(); }
    else renderVerifyEmail('Not confirmed yet. Open the link in the email, then try again.');
  },
  'tour-next': () => { S.tourStep++; renderTour(); },
  'tour-back': () => { S.tourStep--; renderTour(); },
  'tour-skip': () => { S.tourStep = TOUR.length - 1; renderTour(); },
  'tour-choose': async (el) => {
    if (!S.profile.onboarded) { S.profile.onboarded = true; updateDoc(doc(db, 'users', S.user.uid), { onboarded: true }).catch(() => {}); }
    renderSetup(el.dataset.type);
  },
  'setup-back': () => (S.circle ? renderMain() : (S.tourStep = TOUR.length - 1, renderTour())),
  setup: (el) => renderSetup(el.dataset.type),
  replay: () => { S.tourStep = 0; renderTour(); },
  tab: (el) => { S.tab = el.dataset.tab; renderMain(); window.scrollTo(0, 0); },
  goverify: (el) => { S.tab = 'verify'; S.verifyMode = el.dataset.mode; S.codeResult = null; renderMain(); },
  vmode: (el) => { S.verifyMode = el.dataset.mode; S.codeResult = null; renderMain(); },
  newcheck: () => { S.lastSentId = null; renderMain(); },
  notify: async () => { try { await Notification.requestPermission(); } catch {} renderMain(); },
  copy: async (el) => {
    const t = el.dataset.text;
    try { await navigator.clipboard.writeText(t); toast('Copied'); }
    catch { toast('Couldn’t copy automatically. Select the text and copy it.'); }
  },
  answer: async (el) => {
    el.closest('.incoming')?.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await updateDoc(doc(db, 'circles', S.circleId, 'checks', el.dataset.id), { status: el.dataset.v, answeredAt: serverTimestamp() });
      toast(el.dataset.v === 'confirmed' ? 'You confirmed the request' : 'You denied it. They’ve been told to stop.', el.dataset.v === 'confirmed' ? 'ok' : 'bad');
    } catch (e) { toast(isExpired(S.checks.find((c) => c.id === el.dataset.id) || {}) ? 'That check already expired.' : friendlyError(e), 'bad'); }
  },
  report: async (el) => {
    try { await updateDoc(doc(db, 'circles', S.circleId, 'checks', el.dataset.id), { reported: true }); toast('Reported. Everyone in your circle can see it in the log.'); }
    catch (e) { toast(friendlyError(e), 'bad'); }
  },
  upgrade: async (el) => {
    try {
      await updateDoc(doc(db, 'users', S.user.uid), { upgradeInterest: { plan: el.dataset.plan, circleId: S.circleId, at: serverTimestamp() } });
      S.profile.upgradeInterest = { plan: el.dataset.plan };
      toast('Thanks! We’ll let you know as soon as paid plans open.', 'ok'); renderMain();
    } catch (e) { toast(friendlyError(e), 'bad'); }
  },
  csv: () => {
    const rows = [['time', 'checked_by', 'checked_with', 'channel', 'request', 'result', 'reported']]
      .concat(S.checks.map((c) => [new Date(tsMs(c.createdAt)).toISOString(), c.fromName, c.toName, c.channel, c.summary, statusOf(c), c.reported ? 'yes' : 'no']));
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `verth-log-${S.circleId}.csv`; a.click();
  },
};

const forms = {
  signin: async (f) => {
    busy(f, true); setErr('a-err', '');
    try { await signInWithEmailAndPassword(auth, f.querySelector('#a-email').value.trim(), f.querySelector('#a-pass').value); }
    catch (e) { setErr('a-err', friendlyError(e)); busy(f, false); }
  },
  signup: async (f) => {
    const name = f.querySelector('#a-name').value.trim(), email = f.querySelector('#a-email').value.trim(), pass = f.querySelector('#a-pass').value;
    if (!name) return setErr('a-err', 'Add your name so people in your circle recognise you.');
    if (pass.length < 8) return setErr('a-err', 'Use a password with at least 8 characters.');
    busy(f, true); setErr('a-err', '');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user, { url: location.origin + location.pathname });
    } catch (e) { setErr('a-err', friendlyError(e)); busy(f, false); }
  },
  reset: async (f) => {
    busy(f, true);
    try { await sendPasswordResetEmail(auth, f.querySelector('#a-email').value.trim()); renderAuth('signin', 'If an account uses that email, a reset link is on its way.'); }
    catch (e) { setErr('a-err', friendlyError(e)); busy(f, false); }
  },
  create: async (f) => {
    const name = f.querySelector('#c-name').value.trim(), title = f.querySelector('#c-title').value.trim(), type = f.querySelector('#c-type').value;
    if (!name || !title) return setErr('s-err', 'Fill in both fields.');
    busy(f, true);
    try {
      const uid = S.user.uid, cref = doc(collection(db, 'circles')), code = makeInviteCode();
      const b = writeBatch(db);
      b.set(cref, { name, type, ownerUid: uid, inviteCode: code, plan: 'free', memberCount: 1, createdAt: serverTimestamp() });
      b.set(doc(db, 'circles', cref.id, 'members', uid), { uid, name: S.profile.name, title, role: 'admin', codeSecret: randomSecret(), joinedAt: serverTimestamp() });
      b.set(doc(db, 'invites', code), { circleId: cref.id, circleName: name, type, createdBy: uid, createdAt: serverTimestamp() });
      b.update(doc(db, 'users', uid), { circles: arrayUnion(cref.id), activeCircle: cref.id, onboarded: true });
      await b.commit();
      S.profile.circles = [...(S.profile.circles || []), cref.id];
      S.tab = 'circle';
      toast('Circle created. Now invite people.', 'ok');
      await openCircle(cref.id);
    } catch (e) { setErr('s-err', friendlyError(e)); busy(f, false); }
  },
  join: async (f) => {
    const code = f.querySelector('#j-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''), title = f.querySelector('#j-title').value.trim();
    if (code.length !== 6) return setErr('s-err', 'Invite codes have 6 letters and numbers, like ABC-123.');
    if (!title) return setErr('s-err', 'Tell your circle who you are, like “Accounts” or “Son”.');
    busy(f, true);
    try {
      const inv = await getDoc(doc(db, 'invites', code));
      if (!inv.exists()) { setErr('s-err', 'That code doesn’t match any circle. Check it with the person who shared it.'); return busy(f, false); }
      const cid = inv.data().circleId, uid = S.user.uid;
      if ((S.profile.circles || []).includes(cid)) { await openCircle(cid); return; }
      const b = writeBatch(db);
      b.set(doc(db, 'circles', cid, 'members', uid), { uid, name: S.profile.name, title, role: 'member', codeSecret: randomSecret(), inviteCode: code, joinedAt: serverTimestamp() });
      b.update(doc(db, 'circles', cid), { memberCount: increment(1) });
      b.update(doc(db, 'users', uid), { circles: arrayUnion(cid), activeCircle: cid, onboarded: true });
      await b.commit();
      S.profile.circles = [...(S.profile.circles || []), cid];
      S.tab = 'home';
      toast(`You joined ${inv.data().circleName}`, 'ok');
      await openCircle(cid);
    } catch (e) {
      setErr('s-err', e?.code === 'permission-denied' ? 'This circle is full on its current plan, or you’re already in it. Ask the owner.' : friendlyError(e));
      busy(f, false);
    }
  },
  push: async (f) => {
    const toUid = f.querySelector('#v-who').value, what = f.querySelector('#v-what').value.trim(), channel = f.querySelector('#v-channel').value;
    if (!what) return setErr('v-err', 'Describe what they’re asking for, so the other person knows what to confirm.');
    const lim = plan().checksPerMonth;
    if (monthChecks() >= lim) return setErr('v-err', `You’ve used all ${lim} free checks this month. Upgrade for unlimited checks.`);
    busy(f, true);
    try {
      const ref = doc(collection(db, 'circles', S.circleId, 'checks'));
      await setDoc(ref, {
        kind: 'push', fromUid: S.user.uid, fromName: me()?.name || S.profile.name, toUid, toName: memberName(toUid),
        channel, summary: what, status: 'pending', createdAt: serverTimestamp(),
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
    const m = S.members.find((x) => x.uid === uid);
    if (!m?.codeSecret) return setErr('v-err', 'That person hasn’t set up codes yet.');
    const ok = await verifyTotp(m.codeSecret, raw);
    S.codeResult = { ok, name: m.name };
    try {
      await setDoc(doc(collection(db, 'circles', S.circleId, 'checks')), {
        kind: 'code', fromUid: S.user.uid, fromName: me()?.name || S.profile.name, toUid: uid, toName: m.name,
        channel: 'Call', summary: 'Code check', status: ok ? 'code-match' : 'code-mismatch', createdAt: serverTimestamp(),
      });
    } catch {}
    renderMain();
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
});

/* ---------- ticking UI: codes and countdowns ---------- */
let lastWindow = -1, myCode = '';
async function tick() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const s = Math.max(0, Math.round((+el.dataset.countdown - Date.now()) / 1000));
    el.textContent = s > 0 ? `Expires in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.` : 'Expired.';
  });
  const codeEl = document.querySelector('[data-mycode]');
  if (codeEl && me()?.codeSecret) {
    const w = Math.floor(Date.now() / 30000);
    if (w !== lastWindow || !myCode) { lastWindow = w; myCode = await totp(me().codeSecret); }
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
  // re-render once when a visible pending check expires
  if (S.circle && S.checks.some((c) => c.status === 'pending' && Math.abs(tsMs(c.expiresAt) - Date.now()) < 1000) && Date.now() - expiredRerender > 1500) {
    expiredRerender = Date.now(); setTimeout(renderMain, 1100);
  }
}, 1000);

/* ---------- routing ---------- */
function route() {
  const u = S.user;
  if (!u) { stopListeners(); S.circle = null; S.circleId = null; return renderAuth(params.get('mode') === 'signup' ? 'signup' : 'signin'); }
  if (!u.emailVerified) return renderVerifyEmail();
  afterSignIn().catch((e) => paint(`<div class="shell narrow">${brand}<div class="panel"><h1>Couldn’t load your account</h1><p class="muted">${esc(friendlyError(e))}</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`));
}

if (!CONFIGURED) renderNotConfigured();
else onAuthStateChanged(auth, (u) => { S.user = u; route(); });

// Exposed for automated tests only.
if (EMU) window.__verth = { S, auth, db };
