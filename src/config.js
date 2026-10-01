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
  free: { name: 'Free', maxMembers: 5, checksPerMonth: 20, scansPerDay: 2 },
  personal: { name: 'Personal', price: '₹29 / month', maxMembers: 5, checksPerMonth: 20, scansPerDay: Infinity },
  family: { name: 'Family', price: '₹49 / month', maxMembers: 10, checksPerMonth: Infinity, scansPerDay: Infinity },
  team: { name: 'Team', price: '₹99 / person / month', maxMembers: 500, checksPerMonth: Infinity, scansPerDay: Infinity },
};

export const CHECK_TTL_SECONDS = 180;

// Firebase App Check (reCAPTCHA Enterprise) site key. When set, Firebase only accepts
// requests coming from the real Verth site, which blocks scripts and bots.
export const appCheckSiteKey = '';

// Verth Helper's optional Gemini mode (Firebase AI Logic, Gemini Developer API free tier).
// To switch it on: Firebase console → AI Logic → Get started → Gemini Developer API,
// set up App Check (appCheckSiteKey above, required by Firebase from 2 Nov 2026),
// then set enabled: true. Without it, the helper still answers from the built-in guide.
export const AI_HELPER = { enabled: false, model: 'gemini-3.5-flash-lite', perDay: 15 };
