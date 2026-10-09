// Phone safety check-up: Verth's "security guard". A website can't scan the phone or block attacks,
// so this walks people through the phone's own protections, one switch at a time, and keeps
// score on this device. Each step says why it matters and exactly where to tap.
import { SYMPTOMS, XRAY_HOW } from './phonelab.js';
const KEY = 'verth-guard';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const GUARD = [
  { id: 'lock', ic: '🔒', t: 'Screen lock is on', why: 'If your phone is lost or stolen, a PIN, fingerprint or face lock keeps your UPI, bank and WhatsApp closed.', how: { a: 'Settings → Security (or Security & privacy) → Screen lock → choose PIN, pattern, fingerprint or face.', i: 'Settings → Face ID & Passcode (or Touch ID & Passcode) → Turn Passcode On.' } },
  { id: 'remote', ic: '🖥️', t: 'No screen-sharing apps you didn’t install', why: 'Scammers ask you to install AnyDesk, TeamViewer, QuickSupport or RustDesk “for a refund”, then watch your screen and take your money.', how: { a: 'Settings → Apps → look for AnyDesk, TeamViewer, QuickSupport, RustDesk or AirDroid. If you didn’t install it yourself for a real reason, tap it → Uninstall.', i: 'Look on your home screen and App Library for AnyDesk, TeamViewer or similar. Press and hold → Remove App if you don’t need it.' } },
  { id: 'access', ic: '♿', t: 'No unknown app has Accessibility control', why: 'Fake “bank”, “KYC” or “electricity bill” apps ask for Accessibility so they can read your OTPs and tap buttons for you.', how: { a: 'Settings → Accessibility → Installed apps (or Downloaded apps). Turn off anything you don’t recognise, then uninstall that app.', i: 'iPhones don’t let apps take over like this. Just never install profiles or apps from links in messages.' } },
  { id: 'unknown', ic: '📦', t: '“Install unknown apps” is off', why: 'APK files sent on WhatsApp are the most common way phones in India get hacked. Real banks never send APKs.', how: { a: 'Settings → Apps → Special app access → Install unknown apps. Make sure WhatsApp, Chrome, Messages and File manager are all set to “Not allowed”.', i: 'iPhones only install from the App Store. Never install a “profile” someone sends you.' } },
  { id: 'protect', ic: '🛡️', t: 'Google Play Protect is on', why: 'Play Protect checks your apps for known harmful software and warns you.', how: { a: 'Open Play Store → tap your profile picture → Play Protect → ⚙️ → turn on “Scan apps with Play Protect”. Tap Scan.', i: 'Not needed on iPhone. Keep apps to the App Store only.' } },
  { id: 'update', ic: '⬆️', t: 'Phone software is up to date', why: 'Updates fix security holes that criminals know about.', how: { a: 'Settings → System (or About phone) → Software update → Download and install.', i: 'Settings → General → Software Update.' } },
  { id: 'wa2fa', ic: '💬', t: 'WhatsApp two-step verification is on', why: 'Stops someone taking over your WhatsApp with a stolen OTP and messaging your family for money.', how: { a: 'WhatsApp → ⋮ → Settings → Account → Two-step verification → Turn on → choose a 6-digit PIN.', i: 'WhatsApp → Settings → Account → Two-step verification → Turn on.' } },
  { id: 'g2fa', ic: '📧', t: 'Your email has 2-step verification', why: 'Your email can reset almost every other account. Protect it with a second step.', how: { a: 'Open myaccount.google.com → Security → 2-Step Verification → Get started.', i: 'For Gmail: myaccount.google.com → Security → 2-Step Verification. For iCloud it’s on by default.' } },
  { id: 'upi', ic: '💳', t: 'Your UPI and bank apps have their own lock', why: 'An extra lock on payment apps protects you even if someone gets into your unlocked phone.', how: { a: 'In GPay, PhonePe or Paytm settings, turn on the app lock / screen lock. In your bank app, turn on fingerprint login.', i: 'In each payment app’s settings, turn on Face ID / Touch ID lock.' } },
  { id: 'alerts', ic: '🔔', t: 'Bank SMS alerts are on, and you know 1930', why: 'Alerts tell you within seconds if money leaves your account. 1930 is India’s cyber fraud helpline. The first hour matters most.', how: { a: 'Check that your bank sends you an SMS for every transaction (ask at your branch or in the bank app). Save 1930 in your contacts as “Cyber Fraud Helpline”.', i: 'Same: turn on transaction alerts in your bank app, and save 1930 in your contacts.' } },
];
// The check-up refreshes every day: ticks count for today only (India time). Yesterday's result is
// kept so one tap can confirm "everything is still on", and a streak counts full days in a row.
export const today = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayBefore = (d) => today(new Date(d + 'T12:00:00+05:30').getTime() - 864e5);
function raw() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
// Moves the record to today, keeping yesterday's ticks so they can be confirmed in one tap.
function current() {
  let s = raw();
  if (!s.v) s = { v: 2, day: '', ticks: {}, prev: Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'number')), streak: 0 }; // older format
  const d = today();
  if (s.day !== d) { if (s.day) s.prev = s.ticks || {}; s.day = d; s.ticks = {}; save(s); }
  return s;
}
function settle(s) {
  // A day counts for the streak when every protection is ticked that day.
  if (GUARD.every((g) => s.ticks[g.id]) && s.lastFull !== s.day) { s.streak = s.lastFull === dayBefore(s.day) ? (s.streak || 0) + 1 : 1; s.lastFull = s.day; }
  save(s);
}
export function guardState() { return current().ticks; }
export function guardSet(id, on) { const s = current(); if (on) s.ticks[id] = Date.now(); else delete s.ticks[id]; settle(s); }
// One tap: everything that was on yesterday is still on today.
export function guardRepeat() { const s = current(); for (const g of GUARD) if (s.prev?.[g.id]) s.ticks[g.id] = Date.now(); settle(s); }
export const guardScore = () => GUARD.filter((g) => guardState()[g.id]).length;
const prevScore = () => { const s = current(); return GUARD.filter((g) => s.prev?.[g.id]).length; };
export const guardStreak = () => { const s = current(); return s.lastFull === s.day || s.lastFull === dayBefore(s.day) ? s.streak || 0 : 0; };
const TIPS = [
  'Real banks never ask for your OTP, PIN or CVV on a call. Anyone who asks is a scammer.',
  'A “refund” never needs you to scan a QR code or enter your UPI PIN. PIN is only for sending money.',
  'Never install an app (APK) sent on WhatsApp, even if it looks like your bank or electricity board.',
  'A video call from “police” or “CBI” saying you’re under “digital arrest” is always a scam. Hang up.',
  'Part-time job offers that pay you to like videos, then ask you to “invest”, are task scams.',
  'If a family member asks for money by message, call them on their old number before paying.',
  'Courier or customs “parcel held” calls asking for money or Aadhaar are scams.',
  'Check the sender of “KYC update” messages. Banks don’t send links to update KYC.',
  'Lost money to fraud? Call 1930 within the first hour, it gives the best chance to stop it.',
  'Don’t share your screen with anyone who calls you. Uninstall AnyDesk or TeamViewer if you don’t need it.',
];
export const guardTip = () => TIPS[Math.floor(new Date(today() + 'T00:00:00Z').getTime() / 864e5) % TIPS.length];
const level = (n) => (n >= 9 ? ['strong', 'Strong'] : n >= 6 ? ['good', 'Good'] : n >= 3 ? ['weak', 'Needs work'] : ['low', 'At risk']);
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function ring(n) {
  const C = 2 * Math.PI * 44, [k] = level(n);
  return `<svg class="g-ring g-${k}" viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="44"/><circle class="val" cx="50" cy="50" r="44" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - n / GUARD.length)).toFixed(1)}"/></svg>`;
}

// The small card on Home that leads to the check-up.
export function guardCard() {
  const n = guardScore(), [k, label] = level(n);
  return `<section class="guard-card g-${k}"><div class="gc-ring">${ring(n)}<b>${n}<small>/${GUARD.length}</small></b></div>
    <div class="grow"><span class="eyebrow">Your phone’s security guard</span><h2>Phone safety: ${label}</h2>
    <p>${n === GUARD.length ? `Today’s check-up is done${guardStreak() > 1 ? `, ${guardStreak()} days in a row 🔥` : ''}. See you tomorrow.` : n ? `${GUARD.length - n} ${GUARD.length - n === 1 ? 'item' : 'items'} left in today’s check-up.` : `Today’s check-up is ready. It takes about a minute${prevScore() ? ` (yesterday: ${prevScore()}/${GUARD.length})` : ''}.`}</p>
    <p class="gc-tip">💡 ${guardTip()}</p>
    <button class="btn ${n === GUARD.length ? 'ghost' : 'gold'}" data-act="guard-open">${n === GUARD.length ? 'See today’s check-up' : n ? 'Continue today’s check-up' : 'Start today’s check-up'}</button></div></section>`;
}

export function viewGuard(o = {}) {
  const st = guardState(), n = guardScore(), [k, label] = level(n), ios = isIos();
  return `<section class="guard-hero g-${k}"><div class="gc-ring big">${ring(n)}<b>${n}<small>/${GUARD.length}</small></b></div>
      <div><span class="eyebrow">Daily safety check-up · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</span><h1>Phone safety: ${label}</h1>
      <p>Apps, settings and scams change, so Verth asks you to check again every day. Verth can’t see your settings: you check them, and Verth remembers on this phone.</p>
      ${guardStreak() ? `<span class="g-streak">🔥 ${guardStreak()} ${guardStreak() === 1 ? 'day' : 'days'} in a row fully protected</span>` : ''}</div></section>
    ${n < GUARD.length && prevScore() ? `<section class="g-again"><div class="grow"><b>Nothing changed since yesterday?</b><span class="muted small">Yesterday you had ${prevScore()} of ${GUARD.length} protections on. If they’re all still on, confirm them in one tap.</span></div><button class="btn ok" data-act="guard-repeat">All still on ✓</button></section>` : ''}
    ${deviceSection(o)}
    <section class="g-tipcard"><span>💡</span><div><b>Today’s safety tip</b><p>${guardTip()}</p></div></section>
    <ol class="guard-list">${GUARD.map((g, i) => {
      const done = !!st[g.id];
      return `<li class="g-item${done ? ' done' : ''}">
        <details${!done && i === GUARD.findIndex((x) => !st[x.id]) ? ' open' : ''}><summary><span class="g-ic">${done ? '✅' : g.ic}</span><span class="grow"><b>${g.t}</b><span class="muted small">${done ? 'Done' : 'Tap to see how'}</span></span></summary>
          <p>${g.why}</p>
          <p class="g-how"><b>How:</b> ${ios ? g.how.i : g.how.a}</p>
          <button class="btn small ${done ? 'ghost' : 'ok'}" data-act="guard-tick" data-id="${g.id}">${done ? 'Mark as not done' : 'I’ve done this ✓'}</button>
        </details></li>`;
    }).join('')}</ol>
    ${xraySection(o, ios)}
    ${doctorSection(o)}
    ${boardSection(o)}
    <section class="card"><h2>Something already went wrong?</h2><p>If you shared an OTP, installed an app from a link, or let someone see your screen: switch on airplane mode, call your bank’s official number to block your cards and UPI, and call <b>1930</b> or go to <b>cybercrime.gov.in</b>.</p></section>`;
}

/* ---------- extra tools ---------- */
const lockNote = (paid, left, what) => (paid ? '<span class="pill ok">Unlimited</span>' : `<span class="muted small">${left > 0 ? `${left} free ${what} left today` : `No free ${what} left today`}</span>`);
const upsell = (text) => `<div class="g-up"><span>${text}</span><button class="btn small gold" data-act="guard-plans">See plans</button></div>`;

function deviceSection(o) {
  if (!o.device) return `<section class="card g-auto"><h2>Verth is checking this device…</h2><p class="muted small">Looking at what your browser can tell Verth.</p></section>`;
  const r = o.device.results;
  return `<section class="card g-auto"><div class="split"><h2>Verth checked this device for you</h2><span class="pill">${r.filter((x) => x.state === 'ok').length} of ${r.length} good</span></div>
    <ul class="g-auto-list">${r.map((x) => `<li class="ga-${x.state}"><span class="ga-ic" aria-hidden="true">${x.state === 'ok' ? '✓' : x.state === 'warn' ? '!' : 'i'}</span><div><b>${esc(x.t)}</b><span>${esc(x.d)}</span></div></li>`).join('')}</ul>
    <p class="muted small">Checked by your browser, on this device only. A website can’t see your apps or settings, so the check-up below and App X-ray cover the rest.</p></section>`;
}

function xraySection(o, ios) {
  const x = o.xray, busy = o.xrayBusy;
  const res = x ? `<div class="xr-res xr-${x.verdict}" id="xray-result" role="status">
      <h3>${x.verdict === 'danger' ? '⚠️ Act now: risky apps found' : x.verdict === 'caution' ? 'Worth checking' : '✓ No known risky apps in this screenshot'}</h3>
      ${x.items.length ? `<ul class="xr-list">${x.items.map((f) => `<li class="lv${f.level}"><b>${esc(f.name)}</b> <span class="muted small">(“${esc(f.line)}”)</span><p>This ${esc(f.why)}.</p><p class="g-how"><b>What to do:</b> ${esc(f.todo)}</p></li>`).join('')}</ul>`
        : `<p class="muted">Verth read ${x.lines} lines and didn’t find screen-sharing, spy, SMS-forwarding or fake “official” apps. Check every page of your apps list, and the Accessibility and Device admin screens too.</p>`}
      ${x.screen === 'accessibility' ? '<p class="g-how"><b>Accessibility screen:</b> every app listed here as “On” can read your screen and tap for you. Turn off anything you don’t recognise.</p>' : ''}
      ${x.screen === 'admin' ? '<p class="g-how"><b>Device admin screen:</b> only Find My Device (and your work profile, if any) should be here. Turn off anything else, then uninstall it.</p>' : ''}
      <button class="btn small ghost" data-act="xray-clear">Check another screenshot</button></div>` : '';
  return `<section class="card g-tool"><span class="eyebrow">New · App X-ray</span><h2>🩻 Find risky apps from a screenshot</h2>
    <p>Take a screenshot of your apps list and Verth reads it <b>on your phone</b> (the picture never leaves it). It spots screen-sharing apps like AnyDesk, spy apps, SMS forwarders, fake “KYC / bill / reward” APKs and risky loan apps.</p>
    <p class="g-how"><b>How:</b> ${ios ? XRAY_HOW.i : XRAY_HOW.a}</p>
    ${res}
    ${x ? '' : busy ? `<div class="ocr-prog" role="status"><span id="xray-stage">${esc(busy.stage)}</span><div class="bar"><i id="xray-bar" style="width:${busy.pct}%"></i></div></div>`
      : o.xrayLeft > 0 || o.paid ? `<label class="btn primary" for="xray-file">📷 Choose a screenshot</label><input id="xray-file" class="sr-file" type="file" accept="image/*" data-keep="no" aria-label="Choose a screenshot of your apps list">` : upsell('You’ve used today’s free App X-ray. Paid plans include unlimited X-rays for every page of your apps.')}
    <div class="g-meta">${lockNote(o.paid, o.xrayLeft, 'X-ray')}</div><p class="err" id="xray-err" role="alert"></p></section>`;
}

function answer(t) {
  const lines = esc(t).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let out = '', list = false;
  for (const l of lines) {
    const b = /^[•*-]\s+/.test(l);
    if (b && !list) { out += '<ul>'; list = true; }
    if (!b && list) { out += '</ul>'; list = false; }
    const body = l.replace(/^[•*-]\s+/, '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    out += b ? `<li>${body}</li>` : `<p>${body}</p>`;
  }
  return out + (list ? '</ul>' : '');
}

function doctorSection(o) {
  const chat = o.doctor || [], hi = o.lang === 'hi';
  return `<section class="card g-tool" id="doctor"><span class="eyebrow">New · AI Phone Doctor</span><h2>🩺 Is something wrong with my phone?</h2>
    <p>Tell the Phone Doctor what’s strange, like a hot phone, pop-up ads, an OTP you didn’t ask for, or an app you installed from a link. It tells you how worried to be and exactly where to tap. English, Hindi or Hinglish.</p>
    ${chat.length ? `<div class="doc-chat">${chat.map((m) => `<div class="doc-q">${esc(m.q)}</div>${m.a ? `<div class="doc-a">${answer(m.a)}</div>` : m.err ? `<div class="doc-a err-msg">${esc(m.err)}</div>` : '<div class="doc-a"><span class="spin" aria-hidden="true"></span> Thinking…</div>'}`).join('')}</div>` : `<div class="doc-chips">${SYMPTOMS.map(([en, h]) => `<button type="button" class="chip" data-act="doctor-ask" data-q="${esc(hi ? h : en)}">${esc(hi ? h : en)}</button>`).join('')}</div>`}
    ${o.doctorLeft > 0 || o.paid ? `<form data-form="doctor" class="doc-form" novalidate><textarea id="doc-q" aria-label="Describe the problem with your phone" rows="2" maxlength="600" placeholder="${hi ? 'जैसे: फ़ोन अपने आप गर्म हो रहा है…' : 'For example: my phone heats up and the battery dies by noon…'}"></textarea><button class="btn primary" type="submit" ${o.doctorBusy ? 'disabled' : ''}>Ask the Phone Doctor</button></form>`
      : upsell('You’ve used today’s free Phone Doctor questions. Paid plans include unlimited questions.')}
    <div class="g-meta">${lockNote(o.paid, o.doctorLeft, 'questions')}<span class="muted small">Never type OTPs, PINs or passwords. The doctor can’t see your phone; it explains what to check.</span></div></section>`;
}

function boardSection(o) {
  if (!o.inCircle) return '';
  const rows = o.board || [], others = rows.filter((r) => !r.me);
  const share = `<div class="g-share"><div class="grow"><b>Share my daily score with my circle</b><span class="muted small">Only your score (like 8/10) and the date are shared, never your answers or anything on your phone.</span></div>
      <button class="btn small ${o.shareOn ? 'ghost' : 'ok'}" data-act="guard-share">${o.shareOn ? 'Stop sharing' : 'Share my score'}</button></div>`;
  const list = o.boardOpen
    ? (rows.length ? `<ul class="g-board">${rows.map((r) => `<li class="${r.today ? '' : 'stale'}"><span class="gb-n g-${level(r.score)[0]}">${r.today ? r.score : '–'}</span><div class="grow"><b>${esc(r.name)}${r.me ? ' (you)' : ''}</b><span class="muted small">${r.today ? `${level(r.score)[1]} today${r.streak > 1 ? ` · 🔥 ${r.streak} days` : ''}` : 'Hasn’t done today’s check-up'}</span></div></li>`).join('')}</ul>` : '<p class="muted">Nobody has shared a score yet. Ask your circle to open the check-up and tap “Share my score”.</p>')
    : upsell(`${others.length ? `${others.length} ${others.length === 1 ? 'person' : 'people'} in your circle shared a score.` : 'See everyone’s phone safety in one place.'} The family board is included in the Family and Team plans.`);
  return `<section class="card g-tool"><span class="eyebrow">Family & team</span><h2>👨‍👩‍👧 Your circle’s phone safety</h2>
    <p>See who did today’s check-up, and nudge parents or staff whose phones need attention. Scammers go for the weakest phone in the family.</p>
    ${share}${list}</section>`;
}
