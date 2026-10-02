// Firebase web config. These values are public by design (they ship to every browser);
// the Firestore security rules in firestore.rules are what protect the data.
export const firebaseConfig = {
  apiKey: 'AIzaSyCqS-lrEdRU5H0Vu8DCSQFfNhn38JxM7iA',
  authDomain: 'verth-ece65.firebaseapp.com',
  projectId: 'verth-ece65',
  storageBucket: 'verth-ece65.firebasestorage.app',
  messagingSenderId: '747557317741',
  appId: '1:747557317741:web:eef962faa5e4964e06e364',
};

// Plans. Limits on the free plan are checked in the app; paid plans unlock once
// Razorpay subscriptions are connected.
export const PLANS = {
  free: { name: 'Free', maxMembers: 5, checksPerMonth: 20, scansPerDay: 2, photoChecks: 5 },
  personal: { name: 'Personal', price: '₹149 / month', maxMembers: 5, checksPerMonth: 20, scansPerDay: Infinity, photoChecks: Infinity },
  family: { name: 'Family', price: '₹199 / month', maxMembers: 10, checksPerMonth: Infinity, scansPerDay: Infinity, photoChecks: Infinity },
  team: { name: 'Team', price: '₹299 / month', maxMembers: 2000, checksPerMonth: Infinity, scansPerDay: Infinity, photoChecks: Infinity },
};

export const CHECK_TTL_SECONDS = 180;

// Firebase App Check (reCAPTCHA Enterprise) site key. When set, Firebase only accepts
// requests coming from the real Verth site, which blocks scripts and bots.
export const appCheckSiteKey = '';

// AI answers in Verth Helper go through the Verth server (/ai), which holds the Gemini key and limits use.
export const AI_HELPER = { enabled: true };

// Cloudflare Turnstile ("I'm not a robot" check) on Log in and Create account. The site key is
// public; its secret goes only into the Cloudflare worker as TURNSTILE_SECRET. Set both together.
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFMGGhM-8jOnLVGE';

// Razorpay payments go through the Verth payments worker (worker/ folder, on Cloudflare).
// Put its address here after deploying it, e.g. 'https://verth-pay.yourname.workers.dev'.
// While empty, paid plans show "Notify me" and nobody can be charged.
export const PAYMENTS = { api: 'https://verth-pay.umeshdk22.workers.dev' };
