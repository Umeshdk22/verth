// The logged-in Home "presentation": a welcome banner, rotating safety quotes, a scam-alert
// slideshow, how Verth protects you, golden rules and the helpline. Everything here is static
// text written by Verth (no user data), and rotation is driven by the app's 1-second tick, so
// repainting the screen never resets or doubles the slideshows.

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const IC = {
  police: svg('<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M12 8l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 14l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z"/>'),
  sms: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  job: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>'),
  qr: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>'),
  bolt: svg('<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>'),
  box: svg('<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>'),
  chart: svg('<path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>'),
  family: svg('<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c.5-3.2 2.6-5 5-5s4.5 1.8 5 5M14 20c.3-2.5 1.6-4 3-4s2.7 1.5 3 4"/>'),
  video: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  scan: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5M11 8.5v5"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  ask: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M9.5 9a2.5 2.5 0 114 1.9c-.8.5-1.5 1-1.5 2"/><circle cx="12" cy="15.5" r=".5" fill="currentColor"/>'),
  code: svg('<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h.01M10 12h.01M13 12h.01M16 12h.01"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>'),
};

// Original safety lines (English + Hindi).
export const QUOTES = [
  ['A minute of checking can save a lifetime of savings.', 'एक मिनट की जाँच, ज़िंदगी भर की बचत बचा सकती है।'],
  ['Real banks never rush you. Scammers always do.', 'असली बैंक कभी जल्दबाज़ी नहीं करते, ठग हमेशा करते हैं।'],
  ['When in doubt, check it out.', 'शक हो, तो जाँच लीजिए।'],
  ['Your OTP is the key to your money. Never hand it to anyone.', 'OTP आपके पैसों की चाबी है, किसी को मत दीजिए।'],
  ['Hurry is a scammer’s favourite weapon. Slow down and check.', 'जल्दबाज़ी ठग का सबसे बड़ा हथियार है। रुकिए, जाँचिए।'],
  ['Trust people. Verify requests.', 'लोगों पर भरोसा रखिए, माँग की जाँच कीजिए।'],
  ['Protecting your family starts with one question: is it really them?', 'परिवार की सुरक्षा एक सवाल से शुरू होती है: क्या सच में वही हैं?'],
  ['No real job asks you to pay to get hired.', 'कोई असली नौकरी पैसे देकर नहीं मिलती।'],
  ['Being careful isn’t rude. It’s smart.', 'सावधान रहना बदतमीज़ी नहीं, समझदारी है।'],
  ['If it sounds too good to be true, it usually is.', 'जो बात सच होने के लिए बहुत अच्छी लगे, वह अक्सर धोखा होती है।'],
];

// "Scam alert" slideshow: the scams people in India report most.
export const ALERTS = [
  { ic: 'police', tone: 'red', tag: 'Video calls', t: '“Digital arrest” by fake police', how: 'Someone in uniform on a video call says your Aadhaar or a parcel is linked to a crime and keeps you on camera for hours.', flag: 'Real police never arrest anyone on a video call or ask for money to “verify” you.', act: 'Hang up. Call 1930 or visit your nearest police station.' },
  { ic: 'sms', tone: 'violet', tag: 'SMS & WhatsApp', t: 'KYC or PAN “update” messages', how: 'A message says your bank account will be blocked today unless you update KYC through a link.', flag: 'Banks never send KYC links. The website looks real but the address is wrong.', act: 'Don’t click. Paste the message into Scam check.', go: 'scan-message' },
  { ic: 'job', tone: 'amber', tag: 'Jobs & exams', t: 'Pay-to-get-hired offers', how: 'You’re “selected” for a big company and asked to pay for an exam, training, laptop or registration.', flag: 'Real employers never charge candidates. Recruiters don’t use Gmail.', act: 'Check the offer in Scam check and on the company’s official Careers page.', go: 'scan-job' },
  { ic: 'qr', tone: 'teal', tag: 'UPI & QR codes', t: '“Scan to receive money”', how: 'A buyer or “cashback team” sends a QR code and asks you to scan it and enter your UPI PIN to receive money.', flag: 'You never need a PIN or a QR scan to receive money. It always sends money out.', act: 'Upload the QR screenshot to Verth to see who it really pays.', go: 'scan-image' },
  { ic: 'bolt', tone: 'amber', tag: 'Bills', t: 'Electricity cut-off tonight', how: 'An SMS warns your power will be cut at 9:30 pm unless you call an “officer” and pay now.', flag: 'Power companies don’t send threats from mobile numbers.', act: 'Check your bill on the official app or website only.', go: 'scan-message' },
  { ic: 'box', tone: 'violet', tag: 'Courier', t: 'Parcel with “illegal items”', how: 'A “courier company” says a parcel in your name has drugs or fake passports and transfers you to “police”.', flag: 'Couriers don’t transfer calls to police or ask for fines.', act: 'Hang up and report at cybercrime.gov.in.' },
  { ic: 'chart', tone: 'teal', tag: 'Investments', t: 'Stock-tip WhatsApp groups', how: 'A group shares big “guaranteed” profits and asks you to invest through their own app.', flag: 'Guaranteed returns and unknown trading apps are classic traps.', act: 'Invest only through registered brokers you already know.' },
  { ic: 'family', tone: 'red', tag: 'Family', t: '“Hi Papa, this is my new number”', how: 'A message from a new number claims to be your child, in trouble and needing money urgently.', flag: 'A new number plus urgency plus money is the pattern.', act: 'Call their old number, or ask them on Verth before you pay.', go: 'verify' },
  { ic: 'video', tone: 'violet', tag: 'Blackmail', t: 'Strange video calls from strangers', how: 'An unknown video call is recorded and then used to threaten and demand money.', flag: 'Paying never ends it; they always ask for more.', act: 'Don’t pay or reply. Block, save evidence and report at cybercrime.gov.in.' },
];

export const RULES = [
  ['key', 'Never share an OTP, PIN or password', 'Not with your bank, police, family or Verth.'],
  ['sms', 'Banks don’t send KYC links', 'Update KYC only at your branch or in the official app.'],
  ['qr', 'QR codes only send money', 'You never scan or enter a PIN to receive money.'],
  ['job', 'Never pay for a job', 'Exam, training or laptop fees mean it’s a scam.'],
  ['family', 'Check “emergencies” first', 'Call their old number or ask on Verth.'],
  ['phone', 'Report fast: call 1930', 'The first hours matter most to stop the money.'],
];

const STEPS = [
  ['scan-sms', 'Paste or snap it', 'Copy a message, link or number, or take a screenshot. Verth shows every red flag in plain words.'],
  ['org-incoming', 'Ask the real person', 'A request “from your boss” or “from family”? One tap asks them on their own phone.'],
  ['org-stopped', 'Stop the scam', 'If they say No, don’t pay. Verth records it so your whole circle is warned.'],
];

/* ---------- rotation state (survives repaints) ---------- */
const ROT = { quotes: { i: 0, at: Date.now(), every: 5000, n: QUOTES.length }, alerts: { i: 0, at: Date.now(), every: 6000, n: ALERTS.length }, steps: { i: 0, at: Date.now(), every: 3500, n: STEPS.length } };
ROT.quotes.i = Math.floor(Date.now() / 86400000) % QUOTES.length; // a different first quote each day
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = '';

function apply(name) {
  const r = ROT[name], box = document.querySelector(`[data-rot="${name}"]`);
  if (!box) return;
  box.querySelectorAll(':scope > .rot-item').forEach((el, k) => { el.classList.toggle('on', k === r.i); el.setAttribute('aria-hidden', k === r.i ? 'false' : 'true'); });
  document.querySelectorAll(`[data-rot-to^="${name}:"]`).forEach((b) => { const on = +b.dataset.rotTo.split(':')[1] === r.i; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'true' : 'false'); });
}
export function go(name, k) { const r = ROT[name]; if (!r) return; r.i = (k + r.n) % r.n; r.at = Date.now(); apply(name); }
// Called every second by the app.
export function rotate() {
  if (still() || document.hidden) return;
  for (const name of Object.keys(ROT)) {
    const r = ROT[name];
    if (paused === name || !document.querySelector(`[data-rot="${name}"]`)) continue;
    if (Date.now() - r.at >= r.every) go(name, r.i + 1);
  }
}

let wired = false;
function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-rot-to]');
    if (d) { const [n, k] = d.dataset.rotTo.split(':'); go(n, +k); return; }
    const s = e.target.closest('[data-rot-step]');
    if (s) { const [n, k] = s.dataset.rotStep.split(':'); go(n, ROT[n].i + +k); }
  });
  for (const ev of ['mouseover', 'focusin']) document.addEventListener(ev, (e) => { const b = e.target.closest?.('[data-rot]'); paused = b ? b.dataset.rot : ''; });
  let x0 = null, who = '';
  document.addEventListener('touchstart', (e) => { const b = e.target.closest?.('[data-rot]'); who = b ? b.dataset.rot : ''; x0 = who ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) go(who, ROT[who].i + (dx < 0 ? 1 : -1)); x0 = null; });
}

const dots = (name, labels) => `<div class="rot-dots" data-rot-dots="${name}" role="group" aria-label="Choose a slide">${labels.map((l, k) => `<button type="button" data-rot-to="${name}:${k}" class="${k === ROT[name].i ? 'on' : ''}" aria-label="${l}"></button>`).join('')}</div>`;
const item = (name, k, html, cls = '') => `<div class="rot-item ${cls} ${k === ROT[name].i ? 'on' : ''}" aria-hidden="${k === ROT[name].i ? 'false' : 'true'}">${html}</div>`;

/* ---------- sections ---------- */
function greeting() {
  const h = new Date(Date.now() + 19800000).getUTCHours(); // India time
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
// esc: the app's HTML escaper; o: { name, place, people, checks, stopped, scanOnly }
export function heroBanner(esc, o) {
  const first = String(o.name || '').trim().split(/\s+/)[0] || 'there';
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  return `<section class="hero-card">
    <div class="hero-in">
      <span class="hero-date">${esc(today)}</span>
      <h1>${greeting()}, ${esc(first)}</h1>
      <p>${o.scanOnly ? 'Check anything suspicious before you reply, click or pay.' : `You and ${o.people === 1 ? 'your circle' : `${o.people} people`} in <b>${esc(o.place)}</b> are protected by Verth.`}</p>
      <div class="hero-badges">
        <span class="hb"><i>${IC.shield}</i>Protected</span>
        ${o.scanOnly ? '' : `<span class="hb"><b>${o.checks}</b> checks this month</span><span class="hb"><b>${o.stopped}</b> scams stopped</span>`}
      </div>
    </div></section>`;
}

export function quoteCarousel() {
  wire();
  return `<section class="quote-card" aria-label="Safety thought of the moment">
    <span class="q-mark" aria-hidden="true">“</span>
    <div class="rot" data-rot="quotes">${QUOTES.map(([en, hi], k) => item('quotes', k, `<blockquote><p class="q-en">${en}</p><p class="q-hi" lang="hi">${hi}</p></blockquote>`)).join('')}</div>
    ${dots('quotes', QUOTES.map((_, k) => `Thought ${k + 1}`))}
  </section>`;
}

// tiles: [[act, label, sub, icon, extra-data-attrs]]
export function quickTiles(tiles) {
  return `<section class="tiles">${tiles.map(([act, label, sub, ic, data = '', tone = 'violet']) => `<button type="button" class="tile t-${tone}" data-act="${act}" ${data}><i>${IC[ic] || ''}</i><b>${label}</b><span>${sub}</span></button>`).join('')}</section>`;
}

export function alertShow() {
  wire();
  return `<section class="sec-block"><div class="sec-hd"><span class="eyebrow">Scam alerts</span><h2>Scams going around in India</h2>
      <div class="rot-nav"><button type="button" class="rn" data-rot-step="alerts:-1" aria-label="Previous scam">‹</button><button type="button" class="rn" data-rot-step="alerts:1" aria-label="Next scam">›</button></div></div>
    <div class="rot alerts" data-rot="alerts">${ALERTS.map((a, k) => item('alerts', k, `
      <article class="alert-card a-${a.tone}">
        <div class="ac-top"><i>${IC[a.ic]}</i><span class="ac-tag">${a.tag}</span><span class="ac-n">${k + 1} / ${ALERTS.length}</span></div>
        <h3>${a.t}</h3>
        <p class="ac-how">${a.how}</p>
        <p class="ac-flag"><b>Red flag:</b> ${a.flag}</p>
        <p class="ac-do"><b>Do this:</b> ${a.act}</p>
        ${a.go ? `<button type="button" class="btn small ac-btn" data-act="${a.go === 'verify' ? 'tab' : 'scan-kind'}" ${a.go === 'verify' ? 'data-tab="verify"' : `data-kind="${a.go.split('-')[1]}"`}>${a.go === 'verify' ? 'Ask on their phone' : 'Check one now'}</button>` : ''}
      </article>`)).join('')}</div>
    ${dots('alerts', ALERTS.map((a) => a.t))}
  </section>`;
}

export function stepsShow() {
  wire();
  return `<section class="sec-block steps-block"><div class="sec-hd"><span class="eyebrow">How Verth protects you</span><h2>Three taps between you and a scam</h2></div>
    <div class="steps-wrap">
      <div class="rot phone-rot" data-rot="steps">${STEPS.map(([img], k) => item('steps', k, `<div class="mini-phone"><img src="assets/slides/${img}.webp" alt="" width="390" height="780" decoding="async"></div>`)).join('')}</div>
      <ol class="step-list">${STEPS.map(([, t, d], k) => `<li><button type="button" data-rot-to="steps:${k}" class="${k === ROT.steps.i ? 'on' : ''}"><span class="sn">${k + 1}</span><span><b>${t}</b><span>${d}</span></span></button></li>`).join('')}</ol>
    </div>
  </section>`;
}

export function rulesGrid() {
  return `<section class="sec-block"><div class="sec-hd"><span class="eyebrow">Golden rules</span><h2>Six habits that stop almost every scam</h2></div>
    <div class="rules">${RULES.map(([ic, t, d]) => `<div class="rule"><i>${IC[ic]}</i><b>${t}</b><span>${d}</span></div>`).join('')}</div></section>`;
}

export function helplineBand() {
  return `<section class="help-band"><i>${IC.phone}</i><div><b>Lost money to a scam?</b><span>Call <a href="tel:1930">1930</a> right away, or report at <a href="https://cybercrime.gov.in" target="_blank" rel="noopener">cybercrime.gov.in</a>. Then call your bank’s official number.</span></div></section>`;
}

export function signOff() {
  return `<p class="sign-off">Made with care in India <span aria-hidden="true">${IC.heart}</span> Stay alert, stay safe.</p><p class="legal-links">© 2026 Verth · <a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a> · <a href="copyright.html" target="_blank" rel="noopener">Copyright</a></p>`;
}

// A colourful page header for the other tabs.
export function pageHead(kicker, title, sub, ic = 'shield', tone = 'violet') {
  return `<header class="page-head ph-${tone}"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${sub}</p></div><i>${IC[ic] || ''}</i></header>`;
}
