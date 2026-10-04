// Phone safety check-up: Verth's "security guard". A website can't scan the phone or block attacks,
// so this walks people through the phone's own protections, one switch at a time, and keeps
// score on this device. Each step says why it matters and exactly where to tap.
const KEY = 'verth-guard';
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

export function viewGuard() {
  const st = guardState(), n = guardScore(), [k, label] = level(n), ios = isIos();
  return `<section class="guard-hero g-${k}"><div class="gc-ring big">${ring(n)}<b>${n}<small>/${GUARD.length}</small></b></div>
      <div><span class="eyebrow">Daily safety check-up · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</span><h1>Phone safety: ${label}</h1>
      <p>Apps, settings and scams change, so Verth asks you to check again every day. Verth can’t see your settings: you check them, and Verth remembers on this phone.</p>
      ${guardStreak() ? `<span class="g-streak">🔥 ${guardStreak()} ${guardStreak() === 1 ? 'day' : 'days'} in a row fully protected</span>` : ''}</div></section>
    ${n < GUARD.length && prevScore() ? `<section class="g-again"><div class="grow"><b>Nothing changed since yesterday?</b><span class="muted small">Yesterday you had ${prevScore()} of ${GUARD.length} protections on. If they’re all still on, confirm them in one tap.</span></div><button class="btn ok" data-act="guard-repeat">All still on ✓</button></section>` : ''}
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
    <section class="card"><h2>Something already went wrong?</h2><p>If you shared an OTP, installed an app from a link, or let someone see your screen: switch on airplane mode, call your bank’s official number to block your cards and UPI, and call <b>1930</b> or go to <b>cybercrime.gov.in</b>.</p></section>`;
}
