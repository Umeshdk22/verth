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
export function guardState() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
export function guardSet(id, on) { const s = guardState(); if (on) s[id] = Date.now(); else delete s[id]; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export const guardScore = () => GUARD.filter((g) => guardState()[g.id]).length;
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
    <p>${n === GUARD.length ? 'Every protection is switched on. Run it again once a month.' : `${GUARD.length - n} quick ${GUARD.length - n === 1 ? 'fix' : 'fixes'} will make your phone much harder to hack.`}</p>
    <button class="btn ${n === GUARD.length ? 'ghost' : 'gold'}" data-act="guard-open">${n ? 'Continue safety check-up' : 'Start safety check-up'}</button></div></section>`;
}

export function viewGuard() {
  const st = guardState(), n = guardScore(), [k, label] = level(n), ios = isIos();
  return `<section class="guard-hero g-${k}"><div class="gc-ring big">${ring(n)}<b>${n}<small>/${GUARD.length}</small></b></div>
      <div><span class="eyebrow">Safety check-up</span><h1>Phone safety: ${label}</h1>
      <p>Go through each item on your phone and tick it when it’s done. Verth can’t see your settings: you check them, and Verth remembers on this phone.</p></div></section>
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
