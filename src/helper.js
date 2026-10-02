// Verth Helper: a small assistant that explains how to use Verth.
// It answers from the built-in guide below, instantly and offline. When the optional
// Gemini mode is switched on (see AI_HELPER in config.js), questions the guide can't
// answer go to Gemini, which is told to use only this guide.
// It never asks for, stores or forwards OTPs, passwords or card numbers.

/* ---------- the guide ---------- */
// Each topic: keys are words or phrases people use (English, plus common Hinglish).
// `go` adds buttons that take the person straight to the right place.
export const TOPICS = [
  {
    id: 'what', q: 'What is Verth?',
    keys: ['what is verth', 'what does verth do', 'about verth', 'how does verth work', 'what is this', 'kya hai', 'explain verth', 'purpose'],
    a: 'Verth helps you stop scams before you lose money. It does two things:\n• Scam check: paste a message, email, job offer, link or phone number and Verth shows the warning signs.\n• Verify: before you pay or share anything because “someone you know” asked, Verth asks that real person on their own phone. Only act on a green “Confirmed”.',
    go: [['Open Scam check', 'scan'], ['How to use Verth', 'guide']],
  },
  {
    id: 'signup', q: 'How do I create an account?',
    keys: ['sign up', 'signup', 'register', 'create account', 'new account', 'make account', 'account banana', 'account kaise', 'join verth', 'get started', 'start using'],
    a: 'Open the Verth app and tap “Start free” or “Log in”.\n• Type your email and tap “Send code”. Verth emails you a 6-digit code. No password needed.\n• Type the code, then your name. Or just tap “Continue with Google”.\n• A short tour then asks what you want to do: protect your family, your team, or just check something suspicious.',
    go: [['Open the app', 'app']],
  },
  {
    id: 'email', q: 'I didn’t get the verification email',
    keys: ['verification email', 'verify email', 'confirm email', 'email not received', 'no email', 'didnt get email', 'did not get email', 'mail nahi aaya', 'email nahi', 'link not received', 'resend'],
    a: 'The email comes from noreply@verth-ece65.firebaseapp.com.\n• Check Spam, Promotions and Updates folders.\n• Wait a minute, then tap “Send the email again”.\n• Make sure the email address is spelled correctly. If not, sign out and create the account again.\n• In a hurry? “Continue with Google” needs no email link.',
  },
  {
    id: 'signin', q: 'I can’t sign in',
    keys: ['sign in', 'signin', 'log in', 'login', 'cant login', 'cannot login', 'wrong password', 'forgot password', 'reset password', 'password bhool', 'login nahi', 'locked out', 'too many attempts', 'code nahi aaya', 'no code', 'didnt get code', 'otp not received', 'verification code', 'login code', 'get the code', 'got the code', 'code not', 'no email', 'email not', 'send code'],
    a: 'Verth has no password to forget:\n• Type your email and tap “Send code”. Enter the 6-digit code from the email.\n• No email? Check spam or promotions, wait 30 seconds and tap “Send a new code”.\n• Signed up with Google? Tap “Continue with Google”.\n• “Too many codes” or “too many tries” means wait an hour and try again. This protects your account.\n• Never sign in to Verth on someone else’s phone.',
    go: [['Open the app', 'app']],
  },
  {
    id: 'circle', q: 'How do I set up my family or team?',
    keys: ['create circle', 'new circle', 'make circle', 'family circle', 'set up family', 'setup family', 'team setup', 'add family', 'add members', 'add people', 'invite', 'invite code', 'share code', 'parivar', 'add', 'mom', 'mother', 'father', 'dad', 'papa', 'mummy', 'parents', 'wife', 'husband', 'grandparents', 'employee', 'employees', 'colleague', 'staff'],
    a: 'A circle is your family or team on Verth.\n• Create one: choose “Family circle” or “Organisation” and give it a name.\n• Invite: open the Circle tab and share the 8-character invite code (for example in your family WhatsApp group).\n• Approve: each person who uses the code waits until you approve them in the Circle tab. This stops strangers who get hold of the code.\n• Free circles hold up to 5 people.',
    go: [['Open Circle', 'circle']],
  },
  {
    id: 'org', q: 'How do employees join my organisation?',
    keys: ['employee', 'employees', 'staff join', 'team join', 'organisation join', 'organization join', 'company', 'office', 'link employees', 'add employees', 'add staff', 'how employee', 'colleagues', 'my team', 'business', 'company account'],
    a: 'For a company or office:\n• Admin: sign up, choose My organisation and type the company name. You get an 8-character invite code.\n• Admin: open the Circle tab, tap Copy invite message, and send it to your office WhatsApp group or email.\n• Each employee: open the link, sign in, tap I have an invite code, and enter the code with their role (like Accounts).\n• Admin: approve each person in the Circle tab. Nobody gets in without approval.\n• Free for up to 5 people; the Team plan is ₹299 a month for the whole organisation, with no limit on people.',
    go: [['Open Circle', 'circle']],
  },
  {
    id: 'join', q: 'How do I join with an invite code?',
    keys: ['join circle', 'join family', 'join team', 'have a code', 'invite code', 'enter code', 'join with code', 'waiting for approval', 'pending approval', 'not approved', 'still waiting'],
    a: 'Choose “I have an invite code”, type the 8-character code and send your request.\n• You’ll see “Waiting for approval” until an admin of that circle approves you. Ask them to open the Circle tab.\n• Meanwhile you can still use Scam check.\n• If the code doesn’t work, the admin may have made a new one. Ask them for the latest code.',
  },
  {
    id: 'verify', q: 'How do I check a request with the real person?',
    keys: ['verify', 'verification', 'check request', 'send check', 'ask on their phone', 'confirm request', 'is it really', 'someone asking money', 'asking for money', 'paise maang', 'paisa maang', 'new number', 'son asking', 'boss asking', 'director asking', 'transfer money'],
    a: 'When someone asks for money, an OTP or a bank change and says they’re someone you know:\n• Open Verify, choose “Ask on their phone” and pick that person.\n• Say what was asked (for example “Send ₹20,000”) and how it came (WhatsApp, call…).\n• Verth asks the real person on their own registered phone. They have 3 minutes to answer.\n• Act only on a green “Confirmed”. Denied, or no answer, means don’t act.',
    go: [['Open Verify', 'verify']],
  },
  {
    id: 'code', q: 'What is the 6-digit Verth code?',
    keys: ['6 digit', 'six digit', 'verth code', 'their code', 'check a code', 'live call', 'video call', 'deepfake', 'code changes', 'code wrong', 'code mismatch'],
    a: 'On a live phone or video call you can ask the caller for their Verth code.\n• Each pair of people in a circle has its own 6-digit code that changes every 30 seconds.\n• Open Verify, choose “Check a code”, pick who they claim to be and type the code they tell you.\n• A match means you’re talking to them. A wrong code means stop: it may be a fake voice or video.',
    go: [['Check a code', 'verify']],
  },
  {
    id: 'answer', q: 'Someone sent me a check. What do I do?',
    keys: ['received check', 'got a check', 'someone checking', 'checking a request in your name', 'approve check', 'tap yes', 'confirm or deny', 'deny', 'answer check', 'notification'],
    a: 'A check means someone in your circle got a request that claims to be from you.\n• If you really asked for it, tap “Yes, it was me”.\n• If you didn’t, tap “No, it wasn’t me”. They’re told to stop.\n• Never confirm a check because a caller asks you to. Nobody genuine will ever say “just tap Yes”.',
  },
  {
    id: 'expired', q: 'The check expired or nobody answered',
    keys: ['expired', 'no answer', 'not answered', 'timeout', 'time out', '3 minutes', 'three minutes', 'didnt reply', 'did not reply'],
    a: 'A check lasts 3 minutes. If the person doesn’t answer in time, treat it as “don’t act”.\n• Call them on the number you already have saved (not the one that contacted you), or meet in person.\n• You can send a new check any time.',
    go: [['Open Verify', 'verify']],
  },
  {
    id: 'howto', q: 'How do I use Verth? (simple steps)',
    keys: ['how to use', 'how do i use', 'how can i use', 'use verth', 'kaise use', 'use kaise', 'kaise kare', 'kaise karu', 'help me', 'dont understand', 'do not understand', 'confused', 'difficult', 'not able', 'samajh nahi', 'kya karu', 'steps', 'guide me', 'new to phone', 'first time'],
    a: 'It’s easy. Do this:\n• Step 1: Open Verth and sign in.\n• Step 2: Tap Scan at the bottom.\n• Step 3: Tap the picture that matches what you got: Photo or screenshot, Message, Job offer, Link or Phone number.\n• Step 4: Add it (take a screenshot, paste the message, or type the number) and tap the big Check it button.\n• Step 5: Read the answer. Red means danger: don’t pay, don’t share OTP.\nYou can tap the 🔊 Listen button to hear any answer.',
    go: [['📷 Check a screenshot', 'scan-image'], ['💬 Check a message', 'scan-message']],
  },
  {
    id: 'photo', q: 'How do I check a screenshot or photo?',
    keys: ['screenshot', 'screen shot', 'photo', 'image', 'picture', 'pic', 'upload', 'camera', 'gallery', 'ss', 'photo check', 'click photo', 'photo kaise'],
    a: 'You don’t need to copy anything. Just use a picture:\n• Take a screenshot of the message (press Power + Volume-down together on most phones).\n• Open Scam check and tap Photo or screenshot.\n• Tap the big box and choose the screenshot from your gallery, or take a photo of the screen.\n• Tap Check it. Verth reads the words and any QR code and tells you if it’s a scam.\nYour picture stays on your phone. Free accounts get 5 photo checks; paid plans get unlimited.\nOn Android you can also open the screenshot and tap Share → Verth.',
    go: [['📷 Check a screenshot now', 'scan-image']],
  },
  {
    id: 'scan', q: 'How do I check a suspicious message, link or number?',
    keys: ['scam check', 'scan', 'check message', 'check sms', 'check link', 'check url', 'check number', 'check phone', 'suspicious', 'fraud message', 'fake message', 'is this fake', 'is this real', 'is this a scam', 'phishing', 'spam call', 'kyc', 'fake link', 'check email'],
    a: 'Open Scam check and choose what you got: Message or email, Job or exam offer, Link, or Phone number.\n• Paste it and tap “Check it”.\n• Verth shows a verdict (High risk, Be careful, or No obvious red flags), the exact warning signs, and what to do next.\n• The check runs on your device. Verth doesn’t store what you paste.\n• On Android, you can share a message straight to Verth from WhatsApp, Gmail or Messages.',
    go: [['Open Scam check', 'scan']],
  },
  {
    id: 'job', q: 'How do I check a job or exam offer?',
    keys: ['job', 'job offer', 'exam', 'exam fee', 'online exam', 'interview', 'offer letter', 'recruitment', 'recruiter', 'hiring', 'placement', 'internship', 'selected', 'shortlisted', 'registration fee', 'naukri', 'tcs', 'infosys', 'wipro'],
    a: 'Open Scam check and choose “Job or exam offer”.\n• Paste the whole email including the “From:” line and any links, and type the company name if you know it.\n• Verth flags fees, free Gmail/Yahoo recruiters, look-alike company websites and WhatsApp-only interviews, and shows the company’s real email domains.\n• Remember: real companies never charge you for an exam, interview, training or offer letter.',
    go: [['Check a job offer', 'scan-job']],
  },
  {
    id: 'limit', q: 'Why can I only do 2 scam checks?',
    keys: ['limit', '2 per day', 'two per day', 'daily limit', 'free checks', 'used todays', 'no checks left', 'more checks', 'unlimited', 'reset', 'photo limit', '5 photos', 'free photo'],
    a: 'Free accounts get 2 scam checks a day (they reset at midnight, India time) and 5 photo or screenshot checks in total.\n• The Personal plan (₹149 a month) gives unlimited scam and photo checks; Family and Team include them for everyone.\n• Verify checks are separate: free circles get 20 a month.',
    go: [['See plans', 'plan']],
  },
  {
    id: 'plans', q: 'What do the plans cost?',
    keys: ['price', 'pricing', 'plan', 'plans', 'cost', 'subscription', 'pay', 'payment', 'upgrade', 'premium', 'paid', 'free plan', 'kitna', 'kitne ka', 'charges', 'buy', 'subscribe'],
    a: 'Plans:\n• Free: up to 5 people, 20 verify checks a month, 2 scam checks a day, 5 photo checks.\n• Personal ₹149/month: unlimited scam and photo checks.\n• Family ₹199/month: up to 10 people, unlimited checks and photo checks.\n• Team ₹299/month for the whole organisation: everything unlimited, no limit on people, CSV export of the log.\nPay in the Plan tab with UPI Autopay or a card through Razorpay. Verth never sees your card or UPI PIN. Cancel any time from the Plan tab; you keep the plan until the end of the month you paid for.',
    go: [['See plans', 'plan']],
  },
  {
    id: 'billing', q: 'How do I cancel or get a refund?',
    keys: ['cancel subscription', 'cancel my subscription', 'cancel my plan', 'cancel plan', 'unsubscribe', 'stop subscription', 'stop renewal', 'autopay', 'auto pay', 'mandate', 'refund', 'money back', 'charged twice', 'double charged', 'payment failed', 'plan not active', 'paid but', 'receipt', 'invoice', 'cancel'],
    a: 'Cancel any time: open the Plan tab and tap “Cancel subscription”. Renewals stop, and you keep the plan until the end of the month you paid for. You can also cancel the UPI Autopay mandate in your UPI app.\n• Charged twice, charged after cancelling, or plan not switched on within 1 hour of paying? Email umeshdk22@gmail.com with the payment date and amount for a full refund.\n• New subscribers can also ask for a refund within 7 days of their first payment.\n• Refunds reach your account in 5–7 working days.',
    go: [['Open Plan', 'plan']],
  },
  {
    id: 'install', q: 'How do I install Verth on my phone?',
    keys: ['install', 'download', 'app download', 'play store', 'app store', 'apk', 'home screen', 'add to home', 'phone app', 'android', 'iphone', 'share to verth'],
    a: 'Verth installs straight from the website (no Play Store needed, and no APK files).\n• Android (Chrome): tap “Install Verth” on the website, or menu ⋮ → “Install app”. Then “Share → Verth” works from WhatsApp, Gmail and Messages.\n• iPhone (Safari): tap Share → “Add to Home Screen”.\n• Never install a Verth “APK” someone sends you. That would be a scam.',
    go: [['Install Verth', 'install']],
  },
  {
    id: 'device', q: 'I got a new phone',
    keys: ['new phone', 'new device', 'change phone', 'changed phone', 'switch phone', 'another device', 'different device', 'lost phone', 'phone stolen', 'use this device', 'set up on another device'],
    a: 'Verth ties your answers and codes to one device, so a stolen password alone isn’t enough.\n• On the new phone, sign in and tap “Use this device instead”.\n• Everyone in your circle sees that you changed device. Members (not admins) need an admin to approve them again.\n• Lost your phone? Secure your email account and ask your circle admin to check the device warning.',
  },
  {
    id: 'device-warn', q: 'Why does it say someone has a new device?',
    keys: ['new device warning', 'started using verth on a new device', 'device warning', 'device changed'],
    a: 'Verth warns you for 7 days after someone moves Verth to a new device. If they didn’t tell you, confirm with them in person before trusting their answers. A scammer who stole a password would show up this way.',
  },
  {
    id: 'members', q: 'How do I remove someone or leave a circle?',
    keys: ['remove member', 'remove someone', 'kick', 'delete member', 'leave circle', 'exit circle', 'leave family', 'admin', 'make admin', 'new invite code', 'reset code', 'change code'],
    a: 'Everything is in the Circle tab.\n• Admins can approve, decline or remove people, and make a new invite code (the old one stops working).\n• Anyone can leave a circle with “Leave circle” at the bottom.',
    go: [['Open Circle', 'circle']],
  },
  {
    id: 'log', q: 'Where can I see past checks?',
    keys: ['log', 'history', 'past checks', 'old checks', 'records', 'export', 'csv', 'report check', 'audit'],
    a: 'The Log tab lists every check in your circle: who asked, what for, and the answer.\n• Tap “Report” on a check that was a scam attempt so everyone sees it.\n• Team plans can export the log as a CSV file for audits.',
    go: [['Open Log', 'log']],
  },
  {
    id: 'report', q: 'How do I report a scam?',
    keys: ['report scam', 'report number', 'report fraud', 'complain', 'complaint', 'chakshu', 'sanchar saathi', 'block number', 'warn others'],
    a: 'In Scam check, after a result, tap “Report this … as a scam”. Other Verth users then see how many people reported it. Only a scrambled fingerprint is saved, never the text itself.\n• To report a fraud call or SMS to the government, use Chakshu on sancharsaathi.gov.in.\n• If you lost money, call 1930 straight away.',
    go: [['Open Scam check', 'scan']],
  },
  {
    id: 'lost', q: 'I already paid a scammer. What now?',
    keys: ['lost money', 'already paid', 'i paid', 'i sent money', 'i transferred', 'paid them', 'what now', 'what should i do now', 'gave my otp', 'shared my otp', 'shared otp', 'paid scammer', 'got scammed', 'scammed', 'cheated', 'fraud happened', 'money gone', 'money deducted', 'paise kat', 'paisa gaya', 'thagi', 'dhoka', '1930', 'cyber crime', 'cybercrime', 'police complaint', 'money back'],
    a: 'Act fast. The first hours matter most.\n• Call 1930 (National Cyber Crime Helpline) now, or report at cybercrime.gov.in.\n• Call your bank’s official number (from the back of your card or the bank’s website) and ask them to block the card or account and raise a fraud complaint.\n• Keep screenshots, the scammer’s number, UPI ID and transaction ID.\n• Change passwords you may have shared and never share an OTP to “get a refund”. That’s a second scam.',
  },
  {
    id: 'otp', q: 'Is it safe to share an OTP?',
    keys: ['share otp', 'otp', 'one time password', 'cvv', 'upi pin', 'pin', 'someone wants my otp', 'otp share'],
    a: 'No. Never share an OTP, UPI PIN, CVV or password with anyone, even if they say they’re from your bank, the police, or your family. Banks never ask for them.\nIf “someone from the family” asks for an OTP, check with them on Verth first.',
    go: [['Open Verify', 'verify']],
  },
  {
    id: 'arrest', q: 'Someone says I’m under “digital arrest”',
    keys: ['digital arrest', 'cbi', 'police call', 'customs', 'parcel', 'fedex', 'drugs parcel', 'money laundering', 'arrest warrant', 'video call police', 'ed officer', 'narcotics'],
    a: '“Digital arrest” is always a scam. Real police, CBI, customs or ED never arrest anyone on a video call or ask for money to “clear your name”.\n• Hang up. Don’t stay on the call and don’t transfer money.\n• Tell family members. Scammers want you isolated.\n• Report it on 1930 or cybercrime.gov.in.',
    go: [['Check the message', 'scan']],
  },
  {
    id: 'privacy', q: 'What does Verth store about me?',
    keys: ['privacy', 'data', 'store', 'stored', 'safe', 'secure', 'security', 'read my messages', 'read my whatsapp', 'access my phone', 'trust verth', 'personal data'],
    a: 'Verth stores only what it needs: your name, email, your circles and the checks you send or answer.\n• It never reads your WhatsApp, SMS, calls or email. You decide what to paste.\n• Scam checks run on your device and the text isn’t saved.\n• Answers are signed by a key that never leaves your device, so nobody can fake your “Yes”.',
  },
  {
    id: 'helper', q: 'Is this helper a real person?',
    keys: ['are you human', 'are you ai', 'who are you', 'real person', 'talk to human', 'customer care', 'customer support', 'support', 'contact', 'helpline number', 'feedback', 'bug', 'not working', 'error', 'problem'],
    a: 'I’m Verth Helper, an assistant that explains how to use Verth. I’m not a person and I can’t see your account.\nFor a problem I can’t solve, or feedback, open an issue on github.com/Umeshdk22/verth. Verth has no phone helpline, so anyone who calls you “from Verth support” is a scammer.',
  },
];

const HELLO = 'Namaste! I’m Verth Helper. Tell me what happened, and I’ll take you to the right place. Tap a button, or type your question in your own words.';
const SUGGEST = ['howto', 'photo', 'signup', 'circle', 'verify', 'lost'];
// Big "What happened?" buttons, so nobody has to type or know the right words.
const START = [
  ['📷 I have a screenshot or photo', 'scan-image'],
  ['💬 I got a strange message', 'scan-message'],
  ['📞 A number called or messaged me', 'scan-phone'],
  ['💼 I got a job or exam offer', 'scan-job'],
  ['🔗 Someone sent me a link', 'scan-link'],
  ['💸 Someone I know is asking for money', 'ask:verify'],
  ['😟 I already lost money', 'ask:lost'],
  ['🏢 Set up Verth for my office', 'ask:org'],
  ['❓ How do I use Verth?', 'ask:howto'],
];

/* ---------- understanding the question ---------- */
const norm = (t) => ' ' + String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9₹]+/g, ' ').trim() + ' ';

// Picks the best matching topic. Longer phrase matches count for more, so
// "invite code" beats "code". Returns null when nothing fits well enough.
export function findAnswer(text) {
  const t = norm(text);
  if (t.trim().length < 2) return null;
  let best = null;
  const scored = [];
  for (const topic of TOPICS) {
    let s = 0;
    for (const k of topic.keys) {
      const nk = norm(k);
      if (t.includes(nk)) s += nk.trim().split(' ').length * 2 + (nk.length > 8 ? 1 : 0);
    }
    if (s) scored.push([s, topic]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  if (scored.length) best = { topic: scored[0][1], score: scored[0][0], also: scored.slice(1, 3).map((x) => x[1]) };
  return best && best.score >= 2 ? best : null;
}

// Secrets people sometimes paste by mistake. The helper refuses to process or forward them.
export function looksSensitive(text) {
  const t = String(text || '');
  if (/\b(otp|upi pin|pin|cvv|mpin)\b\s*(is|hai|:|=|-)?\s*\d{3,8}\b/i.test(t)) return true;
  const pw = t.match(/\bpassword\s*(?:is|hai|:|=)\s*(\S+)/i);
  if (pw && !/^(not|wrong|incorrect|invalid|correct|right|weak|too|expired|forgotten|lost|working|the|my|a|an|nahi|galat)$/i.test(pw[1].replace(/[.,!?]$/, ''))) return true;
  if (/\b(?:\d[ -]?){15,18}\d\b/.test(t)) return true; // card-like number
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(t) && /aadha?ar/i.test(t)) return true;
  return false;
}

// Something to check rather than a question about the app: a link, a phone number,
// or a pasted message. These go to Scam check instead of the helper (or any AI).
const PHONE_IN = /(?:\+?91[\s-]?)?(?:[6-9]\d{4}[\s-]?\d{5}|1[46]0\d{7,10})/;
const LINK_IN = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|xyz|top|online|site|info|co|org|net|live|shop|link|click|ly|me|io|app)(?:\/\S*)?/i;
// The number or link inside a question like "is 98765 43210 safe?", for Scam check.
export function extractTarget(text, kind) {
  const t = String(text || '');
  if (kind === 'phone') return (t.match(PHONE_IN) || [t])[0].trim();
  if (kind === 'link') return (t.match(LINK_IN) || [t])[0].replace(/[.,!?)]+$/, '');
  return t;
}
export function looksLikeSomethingToCheck(text) {
  const t = String(text || '').trim();
  const short = t.split(/\s+/).length <= 12;
  if (short && PHONE_IN.test(t) && !LINK_IN.test(t)) return 'phone';
  if (short && LINK_IN.test(t) && /\b(safe|real|fake|scam|genuine|check|legit|sahi|asli|nakli|open|click)\b/i.test(t)) return 'link';
  if (/^(https?:\/\/|www\.)\S+$/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return 'link';
  if (/^\+?[\d\s()-]{8,18}$/.test(t)) return 'phone';
  const hasLink = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|in|xyz|top|online|site|info|co|org|net|live|shop|link|click)\b/i.test(t);
  const pasted = /^(from:|subject:|dear (customer|candidate|user|sir|madam))/im.test(t) || t.length > 220;
  if (pasted || (hasLink && t.split(/\s+/).length > 4)) return /\b(exam|interview|recruit|hiring|offer letter|shortlisted|selected|job|placement|internship)\b/i.test(t) ? 'job' : 'message';
  return null;
}

/* ---------- reading answers aloud ---------- */
const CAN_SPEAK = typeof window !== 'undefined' && 'speechSynthesis' in window;
let speakingBtn = null;
function stopSpeaking() {
  if (!CAN_SPEAK) return;
  window.speechSynthesis.cancel();
  if (speakingBtn) speakingBtn.textContent = '🔊 Listen';
  speakingBtn = null;
}
function speak(text, btn) {
  if (!CAN_SPEAK) return;
  if (speakingBtn === btn) { stopSpeaking(); return; }
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text.replace(/[•]/g, '. ').replace(/\s+/g, ' ').trim());
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => /en[-_]IN/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
  u.rate = 0.92;
  u.onend = u.onerror = () => { if (speakingBtn === btn) { btn.textContent = '🔊 Listen'; speakingBtn = null; } };
  speakingBtn = btn; btn.textContent = '⏹ Stop';
  window.speechSynthesis.speak(u);
}

/* ---------- the chat window ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const esc = (t) => String(t ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
// Answers are plain text: escape everything, then turn line breaks and bullets into tidy HTML.
const fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

const BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.3 8.2a2.7 2.7 0 1 1 3.7 2.5c-.6.3-1 .8-1 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="14" r=".6" fill="currentColor" stroke="currentColor"/></svg>';

/**
 * Adds the helper button and chat window to the page.
 * @param {object} o
 * @param {(target:string, text?:string)=>void} o.go  opens a place in Verth ('scan', 'verify', 'plan', 'app', …)
 * @param {(q:string, history:Array)=>Promise<string>} [o.ai]  optional AI fallback
 * @param {boolean} [o.raised]  sit above the app's bottom tab bar
 */
export function mountHelper({ go, ai = null, raised = false } = {}) {
  if (document.getElementById('vh-panel')) return;
  const wrap = document.createElement('div');
  wrap.className = 'vh' + (raised ? ' raised' : '');
  wrap.innerHTML = `
    <button class="vh-fab" type="button" aria-expanded="false" aria-controls="vh-panel">${BUBBLE}<span>Need help?</span></button>
    <section class="vh-panel" id="vh-panel" role="dialog" aria-modal="false" aria-labelledby="vh-title" hidden>
      <header class="vh-head"><div><h2 id="vh-title">Verth Helper</h2><p>${ai ? 'Guide + Gemini AI' : 'Answers from the Verth guide'}</p></div>
        <button class="vh-x" type="button" aria-label="Close helper">✕</button></header>
      <div class="vh-log" aria-live="polite"></div>
      <form class="vh-form" autocomplete="off"><label class="vh-sr" for="vh-q">Ask Verth Helper</label>
        <input id="vh-q" maxlength="400" placeholder="Ask anything about Verth…" enterkeyhint="send" data-keep="no">
        <button class="vh-send" type="submit" aria-label="Send">➤</button></form>
      <p class="vh-foot">Never type an OTP, PIN or password here.${ai ? ' Questions the guide can’t answer are sent to Google Gemini.' : ''}</p>
    </section>`;
  document.body.appendChild(wrap);
  const fab = wrap.querySelector('.vh-fab'), panel = wrap.querySelector('.vh-panel'), log = wrap.querySelector('.vh-log');
  const form = wrap.querySelector('.vh-form'), input = wrap.querySelector('#vh-q');
  const history = [];
  let busy = false, greeted = false;

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };
  function add(who, html, actions = [], big = false) {
    const d = document.createElement('div');
    d.className = 'vh-msg ' + who;
    const say = who === 'bot' && CAN_SPEAK && !html.includes('vh-dots') ? '<button type="button" class="vh-say" aria-label="Listen to this answer">🔊 Listen</button>' : '';
    d.innerHTML = `<div class="vh-b">${html}</div>${say}${actions.length ? `<div class="vh-acts${big ? ' big' : ''}">${actions.map(([label, to, text]) => `<button type="button" class="vh-act" data-to="${esc(to)}"${text ? ` data-text="${esc(text)}"` : ''}>${esc(label)}</button>`).join('')}</div>` : ''}`;
    log.appendChild(d); scrollDown();
    return d;
  }
  const chips = (ids) => ids.map((id) => TOPICS.find((t) => t.id === id)).filter(Boolean).map((t) => [t.q, 'ask:' + t.id]);

  function open() {
    panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); wrap.classList.add('open');
    if (!greeted) { greeted = true; add('bot', fmt(HELLO), START, true); }
    setTimeout(() => input.focus(), 30);
  }
  function close() { stopSpeaking(); panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open'); fab.focus(); }
  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  wrap.querySelector('.vh-x').addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  function showTopic(topic, also = []) {
    add('bot', fmt(topic.a), [...(topic.go || []), ...chips(also.map((t) => t.id))]);
    history.push({ role: 'model', text: topic.a });
  }

  async function ask(q) {
    q = q.trim();
    if (!q || busy) return;
    add('me', esc(q));
    if (looksSensitive(q)) {
      add('bot', fmt('Please don’t type OTPs, PINs, passwords or card numbers anywhere except the official app or website that sent them. I didn’t save or send what you typed.\nIf someone is asking you for it, that’s a red flag. Check with them on Verth first.'), [['Open Verify', 'verify']]);
      return;
    }
    const kind = looksLikeSomethingToCheck(q);
    if (kind) {
      const target = extractTarget(q, kind);
      const what = kind === 'job' ? 'a job or exam offer' : kind === 'phone' ? `the number ${target}` : kind === 'link' ? `the link ${target}` : 'a message';
      add('bot', fmt(`Let’s check ${what}. Tap the button below, then tap the big Check it button.`), [['🔎 Check it in Scam check', 'scan-' + kind, target]], true);
      return;
    }
    history.push({ role: 'user', text: q });
    const hit = findAnswer(q);
    if (hit && (hit.score >= 3 || !ai)) { showTopic(hit.topic, hit.also); return; }
    if (ai) {
      busy = true;
      const wait = add('bot', '<span class="vh-dots" aria-label="Thinking"><i></i><i></i><i></i></span>');
      try {
        const text = await ai(q, history.slice(-8));
        wait.remove();
        add('bot', fmt(text), hit ? [...(hit.topic.go || [])] : []);
        history.push({ role: 'model', text });
      } catch (e) {
        wait.remove();
        if (hit) showTopic(hit.topic, hit.also);
        else add('bot', fmt(e?.message === 'limit' ? 'You’ve used today’s AI answers. I can still answer from the Verth guide. Pick a topic:' : 'I couldn’t reach the AI just now. Here’s what I can help with from the guide:'), chips(SUGGEST));
      } finally { busy = false; }
      return;
    }
    add('bot', fmt('I’m not sure about that one. I can help with these:'), chips(SUGGEST));
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
  log.addEventListener('click', (e) => {
    const sb = e.target.closest('.vh-say');
    if (sb) { speak(sb.previousElementSibling?.innerText || '', sb); return; }
    const b = e.target.closest('.vh-act');
    if (!b) return;
    const to = b.dataset.to;
    if (to.startsWith('ask:')) { const t = TOPICS.find((x) => x.id === to.slice(4)); if (t) { add('me', esc(t.q)); showTopic(t); } return; }
    if (window.matchMedia('(max-width:560px)').matches) close();
    go(to, b.dataset.text);
  });
  return { open, close, ask };
}

/* ---------- what the AI is told ---------- */
export function aiInstructions() {
  return `You are "Verth Helper", the in-app assistant for Verth (https://umeshdk22.github.io/verth/), an Indian anti-scam web app made by Umesh.
Your only job: help people use Verth and stay safe from scams. Answer in the language the person writes in (English, Hindi or Hinglish), in plain words a parent or grandparent understands. Keep answers under 120 words. Use short "• " bullet lines for steps. No markdown headings, tables or links other than the ones in the guide.
Rules:
- Only use facts from the VERTH GUIDE below. If the guide doesn't cover it, say you're not sure and suggest opening an issue at github.com/Umeshdk22/verth. Never invent features, prices, phone numbers or emails.
- Never ask for or accept OTPs, PINs, passwords, card or Aadhaar numbers. If someone shares one, tell them not to.
- Don't judge whether a specific message, link or number is a scam yourself: tell them to use Scam check in the app, and to verify with the real person on Verth.
- If someone lost money: tell them to call 1930 or report at cybercrime.gov.in immediately, and call their bank's official number.
- Politely refuse anything unrelated to Verth or scam safety (homework, coding, news, etc.), and anything that would help someone scam others.
- You can't see the person's account or do things for them; explain where to tap.

VERTH GUIDE:
${TOPICS.map((t) => `Q: ${t.q}\nA: ${t.a}`).join('\n\n')}`;
}
