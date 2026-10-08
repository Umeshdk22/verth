// Verth Scam Check: explains red flags in a suspicious link, phone number or message.
// Runs entirely on the user's device. It gives reasons, not certainty: a clean result
// never proves something is safe.

const HIGH = 3, MED = 2, LOW = 1;

/* ---------- official domains (registered domains) ---------- */
export const OFFICIAL = {
  'State Bank of India': ['sbi.co.in', 'onlinesbi.sbi', 'sbi', 'sbicard.com', 'yonobusiness.sbi', 'onlinesbi.com'],
  'HDFC Bank': ['hdfcbank.com', 'hdfc.com', 'hdfcbank.net', 'hdfclife.com'],
  'ICICI Bank': ['icicibank.com', 'icicidirect.com', 'icicilombard.com'],
  'Axis Bank': ['axisbank.com', 'axis.bank.in'],
  'Kotak Mahindra Bank': ['kotak.com', 'kotak811.com'],
  'Punjab National Bank': ['pnbindia.in', 'pnb.co.in'],
  'Bank of Baroda': ['bankofbaroda.in', 'bankofbaroda.com'],
  'Paytm': ['paytm.com', 'paytmbank.com', 'paytmmoney.com'],
  'PhonePe': ['phonepe.com'],
  'Google Pay': ['google.com', 'pay.google.com', 'gpay.app.goo.gl'],
  'Amazon': ['amazon.in', 'amazon.com', 'amazonpay.in', 'amazon.co.uk'],
  'Flipkart': ['flipkart.com'],
  'IRCTC': ['irctc.co.in', 'irctc.com'],
  'UIDAI (Aadhaar)': ['uidai.gov.in', 'myaadhaar.uidai.gov.in'],
  'Income Tax Department': ['incometax.gov.in', 'incometaxindia.gov.in'],
  'EPFO': ['epfindia.gov.in', 'epfo.gov.in'],
  'NPCI / BHIM': ['npci.org.in', 'bhimupi.org.in'],
  'India Post': ['indiapost.gov.in'],
  'Parivahan / e-Challan': ['parivahan.gov.in', 'echallan.parivahan.gov.in'],
  'LIC': ['licindia.in'],
  'Airtel': ['airtel.in', 'airtel.com'],
  'Jio': ['jio.com'],
  'BSNL': ['bsnl.co.in'],
  'WhatsApp': ['whatsapp.com', 'wa.me'],
  'Instagram': ['instagram.com'],
  'Facebook': ['facebook.com', 'fb.com'],
  'Microsoft': ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com'],
  'Apple': ['apple.com', 'icloud.com'],
  'Netflix': ['netflix.com'],
  'FedEx': ['fedex.com'],
  'DHL': ['dhl.com', 'dhl.co.in'],
  'Blue Dart': ['bluedart.com'],
  'Delhivery': ['delhivery.com'],
};
// Words that, if they appear in a web address, suggest it is imitating that brand.
const BRAND_TOKENS = {
  sbi: 'State Bank of India', onlinesbi: 'State Bank of India', yono: 'State Bank of India', hdfc: 'HDFC Bank', icici: 'ICICI Bank',
  axis: 'Axis Bank', kotak: 'Kotak Mahindra Bank', pnb: 'Punjab National Bank', baroda: 'Bank of Baroda',
  paytm: 'Paytm', phonepe: 'PhonePe', gpay: 'Google Pay', googlepay: 'Google Pay', amazon: 'Amazon', flipkart: 'Flipkart',
  irctc: 'IRCTC', uidai: 'UIDAI (Aadhaar)', aadhaar: 'UIDAI (Aadhaar)', aadhar: 'UIDAI (Aadhaar)', incometax: 'Income Tax Department',
  epfo: 'EPFO', npci: 'NPCI / BHIM', bhim: 'NPCI / BHIM', indiapost: 'India Post', speedpost: 'India Post',
  parivahan: 'Parivahan / e-Challan', echallan: 'Parivahan / e-Challan', lic: 'LIC', airtel: 'Airtel', jio: 'Jio', bsnl: 'BSNL',
  whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', microsoft: 'Microsoft', office365: 'Microsoft',
  apple: 'Apple', icloud: 'Apple', netflix: 'Netflix', fedex: 'FedEx', dhl: 'DHL', bluedart: 'Blue Dart', delhivery: 'Delhivery',
};
const EXACT_ONLY = new Set(['apple', 'axis', 'yono', 'bhim', 'lic']);
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'rb.gy', 'is.gd', 'shorturl.at', 't.ly', 'rebrand.ly', 's.id', 'tiny.cc', 'ow.ly', 'bit.do', 'goo.su', 'v.gd', 'shorturl.asia', 'tinu.be', 'bl.ink', 'short.gy', 'qr.ae'];
const RISKY_TLDS = ['xyz', 'top', 'click', 'link', 'live', 'buzz', 'rest', 'icu', 'cfd', 'sbs', 'cyou', 'monster', 'quest', 'zip', 'mov', 'loan', 'work', 'support', 'online', 'site', 'store', 'shop', 'fun', 'vip', 'win', 'bid', 'lol', 'cam', 'bond', 'autos', 'boats', 'hair', 'beauty', 'skin', 'makeup', 'mom', 'tk', 'ml', 'ga', 'cf', 'gq'];
const TWO_LEVEL = ['co.in', 'gov.in', 'org.in', 'net.in', 'ac.in', 'nic.in', 'res.in', 'bank.in', 'fin.in', 'co.uk', 'org.uk', 'gov.uk', 'com.au', 'co.jp', 'com.br', 'com.sg', 'com.my', 'co.za', 'com.pk', 'com.bd'];
const BAIT_WORDS = ['kyc', 'verify', 'verification', 'update', 'login', 'signin', 'secure', 'account', 'reward', 'refund', 'bonus', 'prize', 'gift', 'claim', 'otp', 'blocked', 'suspend', 'challan', 'unblock', 'reactivate', 'wallet', 'cashback', 'lucky', 'winner', 'redeem', 'penalty', 'fine'];

export function registeredDomain(host) {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  if (TWO_LEVEL.includes(last2)) return parts.slice(-3).join('.');
  return last2;
}
function isOfficialFor(host, brand) {
  const list = OFFICIAL[brand] || [];
  return list.some((d) => host === d || host.endsWith('.' + d));
}
function officialBrandOf(host) {
  // RBI lets only registered Indian banks use .bank.in (and .fin.in for other financial firms).
  if (/\.bank\.in$/.test(host)) return 'Indian bank (.bank.in, only for RBI-registered banks)';
  if (/\.fin\.in$/.test(host)) return 'Indian financial company (.fin.in, only for registered firms)';
  for (const [brand, list] of Object.entries(OFFICIAL)) if (list.some((d) => host === d || host.endsWith('.' + d))) return brand;
  return null;
}
// Undo the character swaps scammers use (0 for o, rn for m and so on).
function unconfuse(s) {
  return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/4/g, 'a').replace(/7/g, 't').replace(/\$/g, 's').replace(/@/g, 'a');
}

function verdict(score, flags) {
  const high = flags.some((f) => f.level === HIGH);
  if (high || score >= 5) return 'danger';
  if (score >= 2) return 'caution';
  return 'clear';
}
const flag = (level, title, why) => ({ level, title, why });

/* ---------- links ---------- */
export function checkLink(input) {
  const raw = String(input || '').trim();
  const flags = [], good = [];
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { url = null; }
  if (!url || !url.hostname || !url.hostname.includes('.')) {
    return { kind: 'link', verdict: 'caution', score: 2, flags: [flag(MED, 'This doesn’t look like a normal web address', 'Check you copied the whole link. Scam links are often broken up or disguised on purpose.')], good, normalized: raw.toLowerCase() };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const reg = registeredDomain(host);
  const tld = host.split('.').pop();
  const full = (host + url.pathname + url.search).toLowerCase();

  if (!['http:', 'https:'].includes(url.protocol)) flags.push(flag(HIGH, `Unusual link type (${url.protocol.replace(':', '')})`, 'Links that aren’t normal web pages can run code or open apps. Don’t tap them.'));
  if (url.username || url.password || /@/.test(raw.split('/')[2] || '')) flags.push(flag(HIGH, 'Hidden address trick (@ in the link)', `Everything before the @ is ignored. This link really goes to ${host}.`));
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) flags.push(flag(HIGH, 'Uses a bare IP address instead of a name', 'Real banks and companies never send links like this.'));
  if (host.includes('xn--') || /[^\x00-\x7f]/.test(input)) flags.push(flag(HIGH, 'Uses look-alike letters', 'The address contains characters from other alphabets that look like English letters, a classic trick to imitate real sites.'));

  const official = officialBrandOf(host);
  if (official) {
    good.push(`This is an official ${official} web address.`);
  } else {
    const plain = host.replace(/[^a-z0-9.-]/g, '');
    const words = plain.split(/[.-]/);
    const hitBrands = new Set();
    for (const w of words) {
      for (const cand of [w, unconfuse(w)]) {
        for (const [tok, brand] of Object.entries(BRAND_TOKENS)) {
          if (tok.length <= 3 || EXACT_ONLY.has(tok) ? cand === tok : cand.includes(tok)) hitBrands.add(brand);
        }
      }
    }
    for (const b of hitBrands) flags.push(flag(HIGH, `Pretends to be ${b}`, `The address mentions ${b}, but ${reg} is not an official ${b} domain.`));
    if (/(^|[.-])gov([.-]|$)/.test(host) && !/\.(gov\.in|nic\.in)$/.test(host)) flags.push(flag(HIGH, 'Pretends to be a government site', 'Indian government websites end in .gov.in or .nic.in. This one doesn’t.'));
  }
  if (SHORTENERS.includes(reg) || SHORTENERS.includes(host)) flags.push(flag(MED, 'Shortened link hides the real destination', 'Scammers shorten links so you can’t see where they lead. Ask the sender for the full address, or don’t open it.'));
  if (RISKY_TLDS.includes(tld) && !official) flags.push(flag(MED, `Cheap “.${tld}” web address`, `Addresses ending in .${tld} are popular with scammers because they cost almost nothing. Banks and government sites don’t use them.`));
  if (url.protocol === 'http:') flags.push(flag(MED, 'Not a secure (https) link', 'Anything you type on this page can be read in transit. Never enter passwords or card details.'));
  if (/\.(apk|xapk|exe|msi|bat|scr|jar|vbs)(\?|$)/i.test(url.pathname)) flags.push(flag(HIGH, 'Downloads an app or program', 'Installing apps from links is how scammers take over phones and read your OTPs. Only install from the Play Store or App Store.'));
  const baits = BAIT_WORDS.filter((w) => full.includes(w));
  if (baits.length && !official) flags.push(flag(baits.length >= 2 ? MED : LOW, 'Uses bait words', `Contains “${baits.slice(0, 4).join('”, “')}”, words scam links use to rush you into logging in or paying.`));
  const subLabels = host.split('.').length - reg.split('.').length;
  if (subLabels >= 3 && !official) flags.push(flag(LOW, 'Unusually long address', 'Long chains of sub-addresses are often used to push the real domain out of view on a phone screen.'));
  if ((host.match(/-/g) || []).length >= 3 && !official) flags.push(flag(LOW, 'Lots of hyphens in the address', 'Addresses like secure-login-update-bank are a common scam pattern.'));

  const score = flags.reduce((a, f) => a + f.level, 0);
  const normalized = (host + url.pathname).replace(/\/+$/, '');
  return { kind: 'link', verdict: official && !flags.some((f) => f.level === HIGH) ? 'clear' : verdict(score, flags), score, flags, good, host, domain: reg, normalized };
}

/* ---------- phone numbers ---------- */
export function checkPhone(input) {
  const raw = String(input || '').trim();
  const flags = [], good = [];
  const plus = raw.startsWith('+') || raw.startsWith('00');
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) d = d.slice(2);
  let country = null, national = d;
  if (plus) {
    if (d.startsWith('91')) { country = 'IN'; national = d.slice(2); } else country = 'INTL';
  } else if (d.length === 12 && d.startsWith('91')) { country = 'IN'; national = d.slice(2); }
  else if (d.length === 11 && d.startsWith('0')) { country = 'IN'; national = d.slice(1); }
  else country = 'IN';

  let type = 'unknown';
  if (!d.length) {
    return { kind: 'phone', verdict: 'caution', score: 2, flags: [flag(MED, 'No number found', 'Type or paste the number exactly as it appeared.')], good, normalized: raw };
  }
  if (country === 'INTL') {
    type = 'international';
    flags.push(flag(MED, 'International number', 'Calls or WhatsApp messages from abroad claiming to be Indian police, a bank, a courier or your telecom company are a classic scam. Indian agencies don’t call from foreign numbers.'));
    if (d.length < 8 || d.length > 15) flags.push(flag(MED, 'Unusual length for a phone number', 'The number may be faked (spoofed) to hide who is really calling.'));
  } else if (/^1600\d{6}$/.test(national)) {
    type = 'bfsi';
    good.push('Numbers starting with 1600 are reserved by TRAI for regulated banks, financial firms and government service calls.');
    flags.push(flag(LOW, 'Still never share an OTP, PIN or password', 'Even real bank staff will never ask for these. If they do, hang up.'));
  } else if (/^1601\d{6}$/.test(national)) {
    type = 'service';
    good.push('Numbers starting with 1601 are being assigned by TRAI for service calls from companies such as utilities and logistics firms.');
  } else if (/^140\d{7}$/.test(national)) {
    type = 'promo';
    good.push('Numbers starting with 140 are registered for promotional (marketing) calls.');
    flags.push(flag(MED, 'Marketing number: it can’t be your bank checking your account', 'If a caller from a 140 number says they’re verifying your account, KYC or a transaction, that’s a lie. Hang up.'));
  } else if (/^(1800|1860)\d{6,7}$/.test(national)) {
    type = 'tollfree';
    flags.push(flag(LOW, 'Toll-free customer care number', 'Real companies use these, but scammers post fake “customer care” numbers online. Only trust numbers from the official app or website.'));
  } else if (/^(1930|112|100|101|102|108|1091|1098|181|14567|155260)$/.test(national)) {
    type = 'helpline';
    good.push(national === '1930' ? 'This is India’s National Cyber Crime Helpline. Call it if you have lost money to a scam.' : 'This is an official Indian emergency or government helpline number.');
  } else if (/^1800\d{6,7}$/.test(national)) {
    type = 'tollfree';
    good.push('This is a toll-free 1800 number. Check it is listed on the company’s official website: caller ID can be faked.');
  } else if (/^[6-9]\d{9}$/.test(national)) {
    type = 'mobile';
    flags.push(flag(LOW, 'Ordinary mobile number', 'Banks, RBI, TRAI, police and courier companies don’t verify accounts, KYC or parcels from personal mobile numbers. If this caller claims to be one of them, it’s a red flag. Banks use numbers starting with 1600.'));
  } else if (/^0?\d{2,4}\d{6,8}$/.test(national) && national.length >= 10 && national.length <= 11) {
    type = 'landline';
    flags.push(flag(LOW, 'Landline number', 'Caller ID for landlines is easy to fake. If they claim to be an official body, call back using a number from its official website.'));
  } else {
    type = 'invalid';
    flags.push(flag(MED, 'Doesn’t look like a valid Indian number', 'The number may be faked (spoofed) or incomplete.'));
  }
  const score = flags.reduce((a, f) => a + f.level, 0);
  const normalized = country === 'INTL' ? '+' + d : '+91' + national;
  return { kind: 'phone', verdict: verdict(score, flags), score, flags, good, type, normalized };
}

/* ---------- messages and emails ---------- */
const SECRET = '(otp|one[- ]?time[- ]?pass(word|code)?|upi\\s*pin|m-?pin|atm\\s*pin|pin|cvv|password|code)';
// True when the text asks you to hand over a secret, but not for "do not share your OTP" warnings.
function asksForSecret(text) {
  const ask = new RegExp('(share|send|tell|give|provide|forward|read\\s+out|enter|type|reply\\s+with|batao|bhejo|bata\\s+do)\\W+(\\w+\\W+){0,4}' + SECRET + '\\b', 'gi');
  for (const m of text.matchAll(ask)) {
    const before = text.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
    if (/(do\s*n[o']?t|never|don't|mat|nahi|na)\s*$/.test(before) || /(do\s*n[o']?t|never|don't)\W+(\w+\W+){0,2}$/.test(before)) continue;
    if (/enter\W+(\w+\W+){0,4}(otp|pin|password|code)\W+(on|in)\s+(the\s+)?(official|app|website|atm)/i.test(m[0])) continue;
    return true;
  }
  return false;
}
const matches = (test, text) => (typeof test === 'function' ? test(text) : test.test(text));

const RULES = [
  [HIGH, 'Asks for an OTP, PIN, CVV or password', 'No bank, company or government office will ever ask for these. Anyone who does is trying to take your money.', asksForSecret],
  [HIGH, '“Digital arrest” or police/CBI threat', 'Real police, CBI, customs or courts never arrest anyone over a video call or ask for money to “clear your name”. This is a well-known scam.', /(digital\s*arrest|cbi|narcotics|money\s*laundering|arrest\s*warrant|stay\s+on\s+(the\s+)?(video\s+)?call|(police|court|customs)\s+(case|notice|summons))/i],
  [HIGH, 'Asks you to install a screen-sharing app', 'Apps like AnyDesk or TeamViewer give a stranger full control of your phone or computer, including your bank apps.', /\b(anydesk|any\s*desk|teamviewer|team\s*viewer|quick\s*support|rustdesk|airdroid|screen\s*shar(e|ing))\b/i],
  [HIGH, 'Tells you to scan a QR code to receive money', 'You never need to scan a QR code or enter your UPI PIN to receive money. Scanning sends money out of your account.', /(scan|qr).{0,40}(receive|get|credited|claim)|receive.{0,30}(scan|qr)/i],
  [HIGH, '“New number” or lost phone, asking for money', 'Scammers pretend to be family or a boss on a new number. Call the person on their old number before sending anything.', /(new\s+number|changed\s+my\s+number|lost\s+my\s+phone|this\s+is\s+my\s+new|phone\s+(is\s+)?(broken|lost))/i],
  [MED, 'Threatens to block, cut off or penalise you', 'Pressure like “your account will be blocked tonight” is designed to stop you thinking. Check directly with the company.', /\b(block(ed)?|suspend(ed)?|deactivat(e|ed)|disconnect(ed|ion)?|legal\s+action|penalty|freeze|frozen|terminated|cut\s+off)\b/i],
  [MED, 'Rushes you', 'Genuine requests give you time. Deadlines like “within 2 hours” or “today only” are a pressure tactic.', /\b(urgent(ly)?|immediately|right\s+now|within\s+\d+\s*(min|minutes|hour|hours|hrs)|today\s+(only|itself)|last\s+(chance|date|day)|expir(e|es|ed|ing)|tonight|jaldi|turant)\b/i],
  [MED, 'KYC, PAN or Aadhaar “update”', 'Banks don’t ask you to update KYC through a link or a call. Visit your branch or use the official app.', /\b(kyc|re-?kyc|pan\s*(card)?\s*(update|link|block)|aadhaa?r\s*(update|link|verify)|e-?kyc)\b/i],
  [MED, 'Prize, lottery, refund or cashback bait', 'If you didn’t enter a contest, you didn’t win one. Refund messages that need you to click or pay first are scams.', /\b(lottery|lucky\s+draw|you\s+(have\s+)?won|winner|prize|jackpot|cashback|refund|reward\s+points|redeem|claim\s+(your|now)|gift\s*card|scratch\s*card)\b/i],
  [MED, 'Work-from-home or task job offer', 'Paid “like and review” tasks, Telegram jobs and part-time offers that need a deposit are the most common job scam in India.', /\b(part[- ]?time|work\s+from\s+home|daily\s+(income|earning|payment)|earn\s+(rs\.?|₹|\d)|like\s+(and|&)\s+subscribe|rating\s+task|review\s+task|telegram\s+(group|task)|prepaid\s+task)\b/i],
  [MED, 'Guaranteed or fast investment returns', 'Nobody can guarantee returns. “Double your money”, secret trading tips and IPO allotment offers are investment scams.', /\b(guaranteed\s+(return|profit)|double\s+(your\s+)?money|(\d{2,3})\s*%\s*(daily|weekly|monthly|return)|trading\s+tips|stock\s+tips|crypto|bitcoin|usdt|ipo\s+allotment|vip\s+group)\b/i],
  [MED, 'Asks you to pay a fee or send money', 'Being asked to pay a “processing”, “registration” or “release” fee to get something is a hallmark of fraud.', /(processing|registration|clearance|release|customs|delivery|verification)\s+(fee|charge|charges)|send\s+(me\s+)?(money|rs|₹)|pay\s+(now|immediately|the\s+fee)|transfer\s+(rs|₹|\d)|upi\s*id/i],
  [MED, 'Parcel or courier trouble', 'Fake courier messages claim your parcel is held, has drugs in it, or needs a small fee. Check on the courier’s official site instead.', /(parcel|courier|package|shipment|consignment|fedex|dhl|blue\s*dart|india\s*post|speed\s*post).{0,60}(held|seized|illegal|drugs|customs|failed|pending|re-?deliver|address\s+(update|incomplete))/i],
  [MED, 'Electricity or gas disconnection threat', 'Utility companies don’t cut power “tonight” over a text. Scammers use this to get you to call them.', /(electricity|electric|power|bijli|gas)\b.{0,60}(disconnect|cut\s*off|be\s+cut|tonight)/i],
  [MED, 'Asks you to keep it secret', 'Scammers tell you not to tell family or colleagues because they would spot the scam.', /(don'?t|do\s+not)\s+(tell|inform)\s+(anyone|anybody|your\s+(family|wife|husband|parents|bank|boss|colleagues))|keep\s+(this|it)\s+(secret|confidential|between\s+us)|between\s+us|confidential\s+matter|kisi\s+ko\s+mat\s+batana/i],
  [LOW, 'Generic greeting', 'Real companies usually use your name. “Dear customer” or “Dear user” suggests a mass message.', /\b(dear\s+(customer|user|valued|sir\/?madam|account\s*holder|beneficiary))\b/i],
  [LOW, 'Asks you to click or call urgently', 'Messages that push you to click a link or call a number right away want you to act before you check.', /\b(click|tap)\s+(here|the\s+link|below|now)|call\s+(us\s+)?(now|immediately|on)\b/i],
];

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"')]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|net|org|xyz|top|click|link|live|info|co|me|ly|gl|io|app|site|online|store|shop|vip|icu|buzz|cfd|sbs|cyou|win|bid|tk|ml|ga|cf|gq|zip|mov|bank|gov\.in|co\.in)(?:\/[^\s<>"')]*)?)/gi;
const PHONE_RE = /(\+?\d[\d\s-]{8,16}\d)/g;

export function checkMessage(input) {
  const text = String(input || '');
  const flags = [], good = [], links = [], phones = [];
  for (const [level, title, why, re] of RULES) if (matches(re, text)) flags.push(flag(level, title, why));
  if (/\bis\s+(your|the)\s+(otp|one[- ]?time|verification\s+code)/i.test(text) && /(do\s*n[o']?t|never)\s+share/i.test(text)) {
    good.push('This looks like a normal OTP message. It’s only safe if you asked for it. Never read it out or forward it to anyone, even “bank staff”.');
  }

  // Email header tricks: display name claims a brand the sending domain doesn't belong to.
  const from = text.match(/^\s*from:\s*(.*)$/im);
  if (from) {
    const addr = (from[1].match(/<?([^\s<>]+@[^\s<>]+)>?/) || [])[1];
    const dom = addr ? addr.split('@')[1].toLowerCase().replace(/[>)\].,]+$/, '') : '';
    const name = from[1].replace(/<[^>]*>/, '').toLowerCase();
    if (dom) {
      for (const [tok, brand] of Object.entries(BRAND_TOKENS)) {
        if (tok.length > 3 && (name.includes(tok) || dom.includes(tok)) && !isOfficialFor(dom, brand)) {
          flags.push(flag(HIGH, `Email claims to be ${brand} but isn’t`, `It was sent from ${dom}, which is not an official ${brand} address.`));
          break;
        }
      }
      if (/@(gmail|yahoo|outlook|hotmail|rediffmail|proton)\./.test(addr || '') && /(bank|kyc|income\s*tax|police|court|customs|support|customer\s*care)/i.test(text)) {
        flags.push(flag(MED, 'Official-sounding email from a free email account', 'Banks, tax departments and police don’t write from Gmail, Yahoo or Outlook addresses.'));
      }
    }
    const reply = text.match(/^\s*reply-to:\s*.*?@([^\s>]+)/im);
    if (reply && dom && !reply[1].toLowerCase().includes(registeredDomain(dom))) flags.push(flag(MED, 'Replies go to a different address', `Your reply would go to ${reply[1]}, not the sender. Scammers do this to collect answers.`));
  }

  const seen = new Set();
  for (const m of text.matchAll(URL_RE)) {
    const u = m[1].replace(/[.,;:!?]+$/, '');
    if (/@/.test(text.slice(Math.max(0, m.index - 1), m.index))) continue; // part of an email address
    const r = checkLink(u);
    if (seen.has(r.normalized)) continue;
    seen.add(r.normalized); links.push(r);
  }
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15 || seen.has(digits)) continue;
    seen.add(digits); phones.push(checkPhone(m[1]));
  }
  for (const l of links) {
    const worst = l.flags.filter((f) => f.level >= MED);
    if (worst.length) flags.push(flag(Math.max(...worst.map((f) => f.level)), `Suspicious link: ${l.host || l.normalized}`, worst.map((f) => f.title).join('. ') + '.'));
    else if (l.good.length) good.push(`Link to ${l.host}: ${l.good[0]}`);
  }
  for (const p of phones) {
    if (p.type === 'international') flags.push(flag(MED, `International number in the message: ${p.normalized}`, 'Be very careful with numbers from abroad in messages that claim to be Indian organisations.'));
  }
  if (links.length && flags.some((f) => /OTP|KYC|block|Rushes/.test(f.title))) flags.push(flag(LOW, 'Pressure plus a link', 'A threat or deadline combined with a link is the most common phishing pattern.'));
  // Combinations that together are almost always a scam.
  const has = (t) => flags.some((f) => f.title.startsWith(t));
  if (has('Asks you to pay a fee') && has('Prize, lottery')) flags.push(flag(HIGH, 'A prize you have to pay for', 'Real prizes and refunds never ask you to pay a fee first. This is how lottery and KBC scams work.'));
  if ((has('Asks you to pay a fee') || /deposit|registration|joining\s+fee|invest/i.test(text)) && has('Work-from-home or task job')) flags.push(flag(HIGH, 'A job that asks you for money', 'Task and part-time jobs that take a fee or deposit are the most common job scam in India. You will be asked for more and more money.'));
  if (has('Parcel or courier') && /(drug|narcotic|illegal|passport|police|officer|press\s*1|customs\s+(duty|fine))/i.test(text)) flags.push(flag(HIGH, 'Fake courier “police” threat', 'Couriers don’t find drugs and transfer you to police. This is the start of a “digital arrest” scam.'));
  if (has('Guaranteed or fast investment') && (links.length || /group|app|telegram|whatsapp/i.test(text))) flags.push(flag(HIGH, 'Guaranteed profits through a group or app', 'Stock-tip groups and trading apps promising fixed returns are investment scams. Invest only through registered brokers.'));
  if (has('Electricity or gas') && (phones.some((p) => p.type === 'mobile') || /officer|call\s+(on|now|us)/i.test(text))) flags.push(flag(HIGH, 'Power cut threat asking you to call someone', 'Electricity boards don’t ask you to call an “officer” on a mobile number. This is a common bill scam.'));
  if (!text.trim()) return { kind: 'message', verdict: 'caution', score: 0, flags: [flag(LOW, 'Nothing to check', 'Paste the message, SMS or email text.')], good, links, phones, normalized: '' };

  const score = flags.reduce((a, f) => a + f.level, 0);
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500);
  return { kind: 'message', verdict: verdict(score, flags), score, flags, good, links, phones, normalized };
}

/* ---------- job and exam offers ---------- */
// Official recruitment domains of large employers in India. Their recruiters write only from these.
export const COMPANIES = {
  'TCS (Tata Consultancy Services)': { domains: ['tcs.com', 'tcsion.com'], site: 'tcs.com', words: ['tcs', 'tata consultancy'] },
  'Infosys': { domains: ['infosys.com', 'infosysbpm.com'], site: 'infosys.com', words: ['infosys'] },
  'Wipro': { domains: ['wipro.com'], site: 'wipro.com', words: ['wipro'] },
  'HCLTech': { domains: ['hcltech.com', 'hcl.com'], site: 'hcltech.com', words: ['hcltech', 'hcl technologies', 'hcl'] },
  'Tech Mahindra': { domains: ['techmahindra.com'], site: 'techmahindra.com', words: ['tech mahindra', 'techmahindra'] },
  'Accenture': { domains: ['accenture.com'], site: 'accenture.com', words: ['accenture'] },
  'Cognizant': { domains: ['cognizant.com'], site: 'cognizant.com', words: ['cognizant'] },
  'Capgemini': { domains: ['capgemini.com'], site: 'capgemini.com', words: ['capgemini'] },
  'LTIMindtree': { domains: ['ltimindtree.com'], site: 'ltimindtree.com', words: ['ltimindtree', 'lti mindtree'] },
  'IBM': { domains: ['ibm.com'], site: 'ibm.com', words: ['ibm'] },
  'Deloitte': { domains: ['deloitte.com'], site: 'deloitte.com', words: ['deloitte'] },
  'KPMG': { domains: ['kpmg.com'], site: 'kpmg.com', words: ['kpmg'] },
  'EY': { domains: ['ey.com'], site: 'ey.com', words: ['ernst & young', 'ernst and young'] },
  'PwC': { domains: ['pwc.com', 'pwc.in'], site: 'pwc.in', words: ['pwc', 'pricewaterhouse'] },
  'Genpact': { domains: ['genpact.com'], site: 'genpact.com', words: ['genpact'] },
  'Mphasis': { domains: ['mphasis.com'], site: 'mphasis.com', words: ['mphasis'] },
  'Oracle': { domains: ['oracle.com'], site: 'oracle.com', words: ['oracle'] },
  'Zoho': { domains: ['zohocorp.com', 'zoho.com'], site: 'zoho.com', words: ['zoho'] },
  'Amazon': { domains: ['amazon.com', 'amazon.in', 'amazon.jobs'], site: 'amazon.jobs', words: ['amazon'] },
  'Google': { domains: ['google.com'], site: 'google.com', words: ['google'] },
  'Microsoft': { domains: ['microsoft.com'], site: 'microsoft.com', words: ['microsoft'] },
  'Flipkart': { domains: ['flipkart.com'], site: 'flipkart.com', words: ['flipkart'] },
  'HDFC Bank': { domains: ['hdfcbank.com'], site: 'hdfcbank.com', words: ['hdfc bank', 'hdfc'] },
  'ICICI Bank': { domains: ['icicibank.com'], site: 'icicibank.com', words: ['icici'] },
  'Airtel': { domains: ['airtel.com', 'airtel.in'], site: 'airtel.in', words: ['airtel'] },
  'Reliance / Jio': { domains: ['ril.com', 'jio.com'], site: 'ril.com', words: ['reliance', 'jio'] },
};
const FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|rediffmail|rediff|proton|protonmail|aol|zoho\.in|yandex|mail)\.(com|in|co\.in|me)\b/i;
const GOV_EXAM = /\b(ssc|upsc|ibps|rrb|railway\s+recruitment|nta|public\s+service\s+commission|psc|sbi\s+po|government\s+(job|exam|recruitment)|sarkari)\b/i;
const officialFor = (dom, c) => c.domains.some((d) => dom === d || dom.endsWith('.' + d));
const wordRe = (w) => new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '([^a-z]|$)', 'i');

export function findCompany(text, claimed) {
  const t = String(claimed || '').trim().toLowerCase();
  if (t) {
    for (const [name, c] of Object.entries(COMPANIES)) if (name.toLowerCase().includes(t) || c.words.some((w) => t.includes(w) || w.includes(t) && t.length >= 3)) return { name, ...c };
  }
  const body = String(text || '');
  for (const [name, c] of Object.entries(COMPANIES)) if (c.words.some((w) => wordRe(w).test(body))) return { name, ...c };
  return null;
}

export function checkJob(input, claimed = '') {
  const text = String(input || '');
  const base = checkMessage(text);
  const flags = [...base.flags], good = [...base.good];
  const add = (level, title, why) => { if (!flags.some((f) => f.title === title)) flags.push(flag(level, title, why)); };
  const company = findCompany(text, claimed);
  const gov = GOV_EXAM.test(text);

  // 1. Money for a job, exam, interview or training.
  const fee = /((pay|deposit|transfer|fee|fees|charges?|amount|rs\.?|₹|inr)\W+(\w+\W+){0,8}(exam|test|assessment|interview|training|registration|onboarding|joining|laptop|kit|id\s*card|uniform|background\s*verification|bgv|document\s*verification|security\s*deposit|refundable|slot|seat|offer\s*letter|appointment\s*letter))|((exam|test|assessment|interview|training|registration|joining|onboarding|laptop|security|refundable|slot|seat|processing)\s*(fee|fees|charges?|deposit|amount))/i;
  if (fee.test(text)) {
    if (gov) add(MED, 'Asks for an exam fee', 'Government exam fees are paid only on the official .gov.in or .nic.in portal, never by UPI to a person or through a link in a message.');
    else add(HIGH, 'Asks you to pay for a job, exam, interview or training', 'Real employers never charge candidates. TCS and Infosys both state publicly that they never ask for any fee or deposit at any stage of hiring.');
  }
  // 2. Who really sent it.
  const emails = [...new Set((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase()))];
  const fromLine = (text.match(/^\s*from:\s*(.*)$/im) || [])[1] || '';
  const sender = ((fromLine.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0] || '').toLowerCase();
  const free = emails.filter((e) => FREE_MAIL.test(e));
  if (free.length) add(HIGH, `Recruiter uses a free email address (${free[0]})`, 'Real companies hire from their own domain. TCS, for example, says it never recruits from Gmail, Yahoo, Rediffmail or Hotmail.');
  if (company) {
    const wrong = emails.filter((e) => !FREE_MAIL.test(e) && !officialFor(e.split('@')[1], company));
    if (wrong.length) add(HIGH, `Email isn’t from ${company.name}`, `${wrong[0].split('@')[1]} is not a ${company.name} domain. Real ${company.name} recruitment emails come only from ${company.domains.map((d) => '@' + d).join(' or ')}.`);
    if (sender && officialFor(sender.split('@')[1], company) && !wrong.length && !free.length) good.push(`Sent from an official ${company.name} address. The “From” line can still be faked, so confirm the offer on ${company.site} yourself.`);
    for (const l of base.links) {
      const h = l.host || '';
      if (!h) continue;
      if (officialFor(h, company)) { good.push(`Link to ${h} is an official ${company.name} website.`); continue; }
      const hostWords = h.replace(/[^a-z0-9.-]/g, '').split(/[.-]/).join(' ');
      if (company.words.some((w) => wordRe(w.replace(/\s+/g, '')).test(hostWords) || hostWords.includes(w.replace(/\s+/g, '')))) {
        l.verdict = 'danger'; // the link list should say so too
        add(HIGH, `Look-alike ${company.name} website: ${h}`, `It uses the ${company.name} name but isn’t on ${company.domains.join(' or ')}. Copying a real company’s website is easy; the address is what gives it away.`);
      }
    }
  } else if (emails.length && !free.length && sender) {
    good.push(`Sent from ${sender.split('@')[1]}. Check that this is the company’s real website before you reply.`);
  }
  // 3. Other hiring red flags.
  if (/(you\s+(have\s+been|are|were)\s+(selected|shortlisted)|congratulations.{0,60}(selected|shortlisted|offer)|offer\s+letter.{0,40}(attached|issued))/i.test(text) && !/interview(ed)?\s+(on|with|held|round)/i.test(text)) {
    add(MED, '“Selected” without a real interview', 'Genuine offers follow tests and interviews you actually attended. A surprise selection for a job or exam you don’t remember applying to is a classic trap.');
  }
  if (/(whatsapp|telegram|signal|google\s+chat|hangouts)\W+(\w+\W+){0,4}(interview|hr|recruit|onboard)|(interview|hr|recruit)\W+(\w+\W+){0,4}(on|via|over)\s+(whatsapp|telegram|signal)/i.test(text)) {
    add(MED, 'Interview or HR on WhatsApp or Telegram', 'Large companies don’t interview or onboard through chat apps. Scammers use them because they’re anonymous.');
  }
  if (/(send|share|upload|submit)\W+(\w+\W+){0,6}(aadhaa?r|pan\s*card|bank\s*(details|statement|passbook|account)|cancelled\s*cheque|passport)/i.test(text)) {
    add(MED, 'Asks for ID or bank documents up front', 'Your Aadhaar, PAN and bank details can be misused for loans and fraud. Share them only after a verified offer, on the company’s official portal.');
  }
  if (/no\s+(experience|interview)\s+(needed|required)|(\d{2,3})\s*(lpa|lakhs?\s+per\s+annum)|earn\s+(up\s+to\s+)?(rs\.?|₹)\s?\d/i.test(text)) {
    add(LOW, 'Sounds too good to be true', 'High pay with no experience or interview is how fake job offers hook people.');
  }
  if (flags.some((f) => f.level === HIGH)) { const keep = good.filter((g) => !/official/i.test(g)); good.length = 0; good.push(...keep); }

  const score = flags.reduce((a, f) => a + f.level, 0);
  return { ...base, kind: 'job', verdict: verdict(score, flags), score, flags, good, company: company ? { name: company.name, domains: company.domains, site: company.site } : null, gov };
}

export function detectKind(text) {
  const t = String(text || '').trim();
  if (/^[+\d][\d\s()-]{7,}$/.test(t)) return 'phone';
  if (!/\s/.test(t) && (/^(https?:\/\/|www\.)/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t))) return 'link';
  return 'message';
}

export function check(kind, text, extra) {
  return kind === 'link' ? checkLink(text) : kind === 'phone' ? checkPhone(text) : kind === 'job' ? checkJob(text, extra) : checkMessage(text);
}

export const JOB_ADVICE = [
  'Never pay to get a job, exam slot, interview, training, laptop or ID card. Real employers don’t charge candidates.',
  'Go to the company’s official website yourself (type it, don’t click the link) and look for the job on its Careers page.',
  'Many companies, including TCS and Infosys, let you verify an offer letter on their official site.',
  'Already paid? Call 1930 or report at cybercrime.gov.in straight away, and tell your bank.',
];

export const ADVICE = {
  danger: ['Don’t click, reply, call back or pay.', 'Never share an OTP, PIN or password with anyone.', 'If it claims to be someone you know, check with them on Verth or their usual number.', 'Report it at sancharsaathi.gov.in (Chakshu). If you lost money, call 1930 or report at cybercrime.gov.in straight away.'],
  caution: ['Don’t act on it yet.', 'Contact the company or person using a number or app you already trust, not the one in the message.', 'Never share an OTP, PIN or password.'],
  clear: ['No obvious red flags, but that doesn’t prove it’s safe.', 'If it asks for money, codes or personal details, check with the real person or company first.'],
};

export async function fingerprint(kind, normalized) {
  const data = new TextEncoder().encode('verth-report-v1|' + kind + '|' + normalized);
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- photos and screenshots ---------- */
// What a QR code inside a picture really does. UPI QR codes SEND money; scammers say "scan to receive".
const RECEIVE_WORDS = /\b(receive|recieve|get|claim|credited|credit|refund|cashback|cash back|prize|won|winner|lottery|reward|bonus|kyc|verify|verification)\b/i;
export function checkQR(data, context = '') {
  const raw = String(data || '').trim();
  const flags = [], good = [];
  if (/^upi:\/\//i.test(raw)) {
    const q = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
    const pa = (q.get('pa') || '').slice(0, 80), pn = (q.get('pn') || '').slice(0, 60), am = q.get('am') || '';
    const amount = am && !isNaN(+am) ? '₹' + Number(am).toLocaleString('en-IN') : '';
    const who = pn ? `“${pn}”${pa ? ` (${pa})` : ''}` : pa || 'someone';
    if (RECEIVE_WORDS.test(context)) {
      flags.push(flag(HIGH, 'A QR code you’re told will give you money', `This QR code actually PAYS ${amount ? amount + ' ' : ''}to ${who}. You never scan a QR code or enter your UPI PIN to receive money. This is a common scam.`));
    } else {
      flags.push(flag(MED, `This QR code sends ${amount || 'money'} to ${who}`, 'Scanning it opens your UPI app to pay. Only scan it if you want to pay this shop or person, and check the name in your UPI app before entering your PIN.'));
    }
    return { flags, good, info: { type: 'upi', payee: pa, name: pn, amount } };
  }
  if (/^(https?:\/\/|www\.)/i.test(raw) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw)) {
    const r = checkLink(raw);
    for (const f of r.flags) flags.push(flag(f.level, 'QR code link: ' + f.title, f.why));
    if (!r.flags.length) good.push(`The QR code opens ${r.host || raw}, which shows no warning signs.`);
    return { flags, good, info: { type: 'link', host: r.host || raw, verdict: r.verdict } };
  }
  return { flags, good, info: { type: 'text', text: raw.slice(0, 200) } };
}

// Cleans up text read from a picture: joins broken lines and fixes common reading slips in links.
export function cleanOcr(text) {
  return String(text || '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/(https?):\s*\/\s*\//gi, '$1://')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    // drop "lines" that are really picture noise (QR codes, icons): too few real letters
    .filter((l) => { const t = l.trim(); if (!t) return true; const good = (t.match(/[a-z0-9₹@]/gi) || []).length; return good >= 4 && good / t.length >= 0.55 && /[a-z0-9₹@]{3,}/i.test(t); })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const JOB_WORDS = /\b(exam|interview|recruit|recruitment|hiring|offer letter|shortlisted|selected|job|placement|internship|hr team|walk-?in|joining)\b/i;
export function checkImage(text, qrData) {
  const t = cleanOcr(text);
  const readable = t.replace(/[^a-z0-9]/gi, '').length >= 12;
  if (!readable && !qrData) return { kind: 'image', unreadable: true };
  const sub = readable && JOB_WORDS.test(t) ? 'job' : 'message';
  const base = readable ? (sub === 'job' ? checkJob(t) : checkMessage(t)) : { flags: [], good: [], links: [], phones: [], normalized: '' };
  const flags = [...base.flags], good = [...base.good];
  let qr = null;
  if (qrData) { qr = checkQR(qrData, t); flags.push(...qr.flags); good.push(...qr.good); }
  const score = flags.reduce((a, f) => a + f.level, 0);
  return {
    ...base, kind: 'image', sub, text: t, qr: qr?.info || null, flags, good,
    score, verdict: verdict(score, flags),
    fpKind: 'message', normalized: base.normalized || (qrData ? String(qrData).trim().toLowerCase() : ''),
  };
}
