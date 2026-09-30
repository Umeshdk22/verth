// Firebase web config. These values are public by design (they ship to every browser);
// the Firestore security rules in firestore.rules are what protect the data.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

// Plans. Limits on the free plan are checked in the app; paid plans unlock once
// Razorpay subscriptions are connected.
export const PLANS = {
  free: { name: 'Free', maxMembers: 5, checksPerMonth: 20 },
  family: { name: 'Family', price: '₹49 / month', maxMembers: 10, checksPerMonth: Infinity },
  team: { name: 'Team', price: '₹99 / person / month', maxMembers: 500, checksPerMonth: Infinity },
};

export const CHECK_TTL_SECONDS = 180;
