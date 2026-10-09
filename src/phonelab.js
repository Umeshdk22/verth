// Extra tools in the phone safety check-up.
// A website can't look inside the phone or run in the background, so every tool here is honest
// about what it does: it reads what the browser is allowed to tell, reads a screenshot the person
// chooses (on the phone itself), or answers questions with the Verth AI.

/* ---------- 1. What Verth can check by itself ---------- */
// Chrome ships a new major version about every 4 weeks (Chrome 120 came out on 5 December 2023).
// Counting a month per version stays a little behind the real number, so an up-to-date browser is never called old.
export const expectedChrome = (now = Date.now()) => 120 + Math.floor((now - Date.UTC(2023, 11, 5)) / (30.5 * 864e5));
// Apple numbers iOS by the coming year since iOS 26 (September 2025).
export const expectedIos = (now = Date.now()) => { const d = new Date(now), y = d.getUTCFullYear(); return d.getUTCMonth() >= 8 ? y - 2000 + 1 : y - 2000; };

export function parseDevice(ua = '', hints = {}) {
  const out = { os: 'other', osVersion: 0, browser: 'other', browserVersion: 0, model: hints.model || '' };
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[_.]/);
  if (ios) { out.os = 'ios'; out.osVersion = +ios[1]; }
  else if (/Android/.test(ua)) { out.os = 'android'; out.osVersion = parseFloat(hints.platformVersion || (ua.match(/Android (\d+(\.\d+)?)/) || [])[1] || 0) || 0; }
  else if (/Windows/.test(ua)) out.os = 'windows';
  else if (/Mac OS X/.test(ua)) out.os = 'mac';
  let m;
  if ((m = ua.match(/SamsungBrowser\/(\d+)/))) { out.browser = 'samsung'; out.browserVersion = +m[1]; }
  else if ((m = ua.match(/(?:Edg|EdgA)\/(\d+)/))) { out.browser = 'edge'; out.browserVersion = +m[1]; }
  else if ((m = ua.match(/(?:Chrome|CriOS)\/(\d+)/))) { out.browser = 'chrome'; out.browserVersion = +m[1]; }
  else if ((m = ua.match(/Firefox\/(\d+)/))) { out.browser = 'firefox'; out.browserVersion = +m[1]; }
  else if ((m = ua.match(/Version\/(\d+).*Safari/))) { out.browser = 'safari'; out.browserVersion = +m[1]; }
  // Android hides the real version in the user agent ("Android 10; K"): only trust the hint.
  if (out.os === 'android' && !hints.platformVersion) out.osVersion = 0;
  return out;
}

// Each result: { id, state: 'ok' | 'warn' | 'info', t: title, d: detail }
export function judgeDevice(dev, { lock = null, installed = false, now = Date.now() } = {}) {
  const res = [];
  if (lock === true) res.push({ id: 'lock', state: 'ok', t: 'Screen lock is set up', d: 'This device has a fingerprint, face, PIN or pattern lock that apps can use.' });
  else if (lock === false) res.push({ id: 'lock', state: 'info', t: 'Couldn’t confirm a screen lock', d: 'Your browser didn’t report a fingerprint, face or PIN lock. If this device has one, all good. If not, set one up now (see “Screen lock is on” below).' });
  if (dev.os === 'android') {
    if (dev.osVersion >= 13) res.push({ id: 'os', state: 'ok', t: `Android ${Math.floor(dev.osVersion)}`, d: 'A recent Android version that still gets security fixes. Keep installing updates.' });
    else if (dev.osVersion > 0) res.push({ id: 'os', state: 'warn', t: `Android ${Math.floor(dev.osVersion)} is old`, d: 'Phones on Android 12 or older may no longer get security fixes. Check Settings → System → Software update. If there’s nothing newer, avoid banking apps on this phone or plan a newer phone.' });
  } else if (dev.os === 'ios' && dev.osVersion) {
    const want = expectedIos(now);
    if (dev.osVersion >= want - 1) res.push({ id: 'os', state: 'ok', t: `iOS ${dev.osVersion}`, d: 'A current iOS version. Keep installing updates.' });
    else res.push({ id: 'os', state: 'warn', t: `iOS ${dev.osVersion} is out of date`, d: 'Update in Settings → General → Software Update to get the latest security fixes.' });
  }
  if (['chrome', 'edge', 'samsung'].includes(dev.browser) && dev.browserVersion) {
    const behind = dev.browser === 'samsung' ? 0 : expectedChrome(now) - dev.browserVersion;
    const name = { chrome: 'Chrome', edge: 'Edge', samsung: 'Samsung Internet' }[dev.browser];
    if (behind <= 3) res.push({ id: 'browser', state: 'ok', t: `${name} is up to date`, d: `Version ${dev.browserVersion}. Browsers fix dangerous security holes every few weeks.` });
    else res.push({ id: 'browser', state: 'warn', t: `${name} is ${behind > 6 ? 'very ' : ''}out of date`, d: `You have version ${dev.browserVersion}. Update it in the Play Store (or App Store): search ${name} → Update. Old browsers can be attacked just by opening a bad link.` });
  }
  res.push(installed
    ? { id: 'app', state: 'ok', t: 'Verth is installed', d: 'You can check things in one tap and share screenshots straight to Verth.' }
    : { id: 'app', state: 'info', t: 'Install Verth on your home screen', d: 'Then you can share a message or screenshot straight to Verth from WhatsApp. See “How to use Verth”.' });
  return res;
}

export async function deviceChecks() {
  let lock = null, hints = {};
  try { if (window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) lock = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { lock = null; }
  try { if (navigator.userAgentData?.getHighEntropyValues) hints = await navigator.userAgentData.getHighEntropyValues(['platformVersion', 'model']); } catch {}
  const installed = !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);
  const dev = parseDevice(navigator.userAgent || '', navigator.userAgentData?.platform === 'Android' ? hints : {});
  return { dev, results: judgeDevice(dev, { lock, installed }) };
}

/* ---------- 2. App X-ray: a screenshot of the apps list ---------- */
const APPS = [
  // Remote control: scammers ask you to install these "for a refund" or "KYC help".
  ['AnyDesk', /any\s*desk/i, 'remote'], ['TeamViewer', /team\s*viewer/i, 'remote'], ['QuickSupport', /quick\s*support/i, 'remote'],
  ['RustDesk', /rust\s*desk/i, 'remote'], ['AirDroid', /air\s*droid|air\s*mirror/i, 'remote'], ['Splashtop', /splashtop/i, 'remote'],
  ['UltraViewer', /ultra\s*viewer/i, 'remote'], ['Chrome Remote Desktop', /remote\s*desktop/i, 'remote'], ['Zoho Assist', /zoho\s*assist/i, 'remote'],
  ['Mobizen', /mobizen/i, 'remote'], ['Supremo', /supremo/i, 'remote'], ['Remote support app', /remote\s*(support|control|access)/i, 'remote'],
  // Spy apps that hide on a phone and send messages, location and calls to someone else.
  ['mSpy', /\bm\s*spy\b/i, 'spy'], ['FlexiSPY', /flexi\s*spy/i, 'spy'], ['Spyic', /spyic/i, 'spy'], ['Cocospy', /coco\s*spy/i, 'spy'],
  ['TheTruthSpy', /truth\s*spy/i, 'spy'], ['Hoverwatch', /hover\s*watch/i, 'spy'], ['Spyzie', /spyzie/i, 'spy'], ['XNSPY', /xnspy/i, 'spy'],
  ['KidsGuard', /kids\s*guard/i, 'spy'], ['Eyezy', /eyezy/i, 'spy'], ['uMobix', /umobix/i, 'spy'], ['Spy app', /\bspy\b/i, 'spy'],
  // SMS forwarders read your OTPs and send them on.
  ['SMS forwarding app', /sms\s*forward|forward\s*sms|auto\s*forward/i, 'sms'],
  // Fake "official" apps sent as APK files.
  ['Fake KYC app', /\b(e-?)?kyc\b/i, 'fake'], ['Fake rewards app', /rewards?\s*points?|redeem\s*points?|credit\s*card\s*rewards?/i, 'fake'],
  ['Fake refund app', /refund/i, 'fake'], ['Fake “customer care” app', /customer\s*(care|support|service)/i, 'fake'],
  ['Fake electricity bill app', /(electricity|bijli|power)\s*(bill|update)/i, 'fake'], ['Fake traffic fine app', /\brto\b|e-?challan|parivahan\s*(apk|update)/i, 'fake'],
  ['Fake Aadhaar / PAN app', /(aadhaa?r|pan\s*card)\s*(update|link|kyc)/i, 'fake'], ['Fake government scheme app', /pm\s*kisan|yojana/i, 'fake'],
  ['Fake tax refund app', /income\s*tax/i, 'fake'], ['Fake invitation app', /invitation|wedding\s*card/i, 'fake'], ['APK file', /\.apk\b/i, 'fake'],
  // Instant loan apps: many are illegal and harass people.
  ['Instant loan app', /(instant|quick|easy|fast)\s*(loan|cash|credit)|loan\s*app/i, 'loan'],
];
// Real apps whose names contain the words above.
const LEGIT = /google\s*opinion\s*rewards|samsung\s*(rewards|members)|amazon|flipkart|cred\b|phonepe|paytm|google\s*pay|bhim|sbi\s*card|hdfc|icici|axis|kotak|digilocker|mparivahan|umang|aadhaa?r\s*face\s*rd|maadhaa?r|incometax\s*india|ais\s*for\s*taxpayer|bajaj|truecaller|whatsapp/i;
const KIND = {
  remote: { level: 3, why: 'lets someone else see and control your screen, including your bank and UPI apps', todo: 'If you didn’t install it yourself for a real reason (like office IT), uninstall it now: press and hold the app → Uninstall.' },
  spy: { level: 3, why: 'is a spy app that can send your messages, calls and location to someone else', todo: 'Uninstall it. If it won’t uninstall, check Settings → Security → Device admin apps and turn it off first. Then change your email and WhatsApp passwords from another phone.' },
  sms: { level: 3, why: 'can read and forward your SMS, including bank OTPs', todo: 'Uninstall it unless you set it up yourself, and tell your bank if you see any payment you didn’t make.' },
  fake: { level: 2, why: 'has a name scammers use for fake “official” apps sent on WhatsApp', todo: 'Real banks and government offices don’t send apps. If this came as a file or link, uninstall it, switch off mobile data, and call your bank on its official number.' },
  loan: { level: 1, why: 'looks like an instant loan app. Many of these are illegal and misuse your contacts and photos', todo: 'Use only loan apps from your bank or an RBI-registered lender. Check the lender at sachet.rbi.org.in. Uninstall the app if you didn’t mean to install it.' },
};

export function xrayText(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 80);
  const found = new Map();
  for (const line of lines) {
    if (LEGIT.test(line)) continue;
    for (const [name, re, kind] of APPS) {
      if (re.test(line) && !found.has(name)) { found.set(name, { name, kind, line: line.slice(0, 60), ...KIND[kind] }); break; }
    }
  }
  const items = [...found.values()].sort((a, b) => b.level - a.level);
  const words = lines.join(' ');
  const screen = /accessibility/i.test(words) ? 'accessibility' : /install\s*unknown\s*apps?/i.test(words) ? 'unknown' : /device\s*admin/i.test(words) ? 'admin' : 'apps';
  const worst = items.reduce((m, f) => Math.max(m, f.level), 0);
  return { items, screen, lines: lines.length, verdict: worst >= 3 ? 'danger' : worst >= 1 ? 'caution' : 'clear', unreadable: lines.length < 3 };
}

export const XRAY_HOW = {
  a: 'Open Settings → Apps (or Apps & notifications → See all apps) and take screenshots of the whole list. Also try Settings → Accessibility → Installed apps, and Settings → Security → Device admin apps.',
  i: 'Open Settings and scroll down to the list of apps, or swipe to the last home screen page (App Library) and take screenshots.',
};

/* ---------- 3. Phone Doctor: quick symptoms ---------- */
export const SYMPTOMS = [
  ['Battery drains fast and the phone gets hot', 'बैटरी जल्दी खत्म, फ़ोन गर्म'],
  ['Ads keep popping up on my screen', 'स्क्रीन पर बार-बार ऐड आते हैं'],
  ['I got an OTP I didn’t ask for', 'मुझे बिना माँगे OTP आया'],
  ['WhatsApp logged me out by itself', 'WhatsApp अपने आप लॉग-आउट हो गया'],
  ['I installed an app from a link on WhatsApp', 'मैंने WhatsApp लिंक से ऐप इंस्टॉल किया'],
  ['Someone may have seen my screen or used my phone', 'शायद किसी ने मेरा फ़ोन देखा या इस्तेमाल किया'],
];
