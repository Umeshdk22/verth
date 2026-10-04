// Publishes firestore.rules to the live project with the Firebase Rules API.
// Needs only the "Firebase Rules Admin" role. Used by GitHub Actions (key in FIREBASE_DEPLOY_KEY).
// Usage: GOOGLE_APPLICATION_CREDENTIALS=key.json node tools/publish_rules.mjs verth-ece65
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const project = process.argv[2] || 'verth-ece65';
const fail = (msg) => { console.log(`::error title=Rules not published::${msg}`); process.exit(1); };
let sa;
try { sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')); }
catch { fail('The FIREBASE_DEPLOY_KEY secret is not valid JSON. Paste the whole key file, from { to }.'); }
if (!sa.client_email || !sa.private_key) fail('The key is missing client_email or private_key. Paste the whole key file.');

const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')}`;

const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
const t = await tok.json().catch(() => ({}));
if (!t.access_token) fail(`Google refused the key (${tok.status} ${t.error || ''} ${t.error_description || ''}). Make a new JSON key for github-rules and update the secret.`);
const api = async (method, path, body) => {
  const r = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, { method, headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) fail(`${method} ${path.split('?')[0]} failed (${r.status}): ${j.error?.message || 'unknown error'}${r.status === 403 ? ' Give the github-rules service account the Firebase Rules Admin role, and make sure the Firebase Rules API is enabled.' : ''}`);
  return j;
};

const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const ruleset = await api('POST', `projects/${project}/rulesets`, { source: { files: [{ name: 'firestore.rules', content: source }] } });
const release = `projects/${project}/releases/cloud.firestore`;
await api('PATCH', release, { release: { name: release, rulesetName: ruleset.name } });
console.log(`::notice title=Rules published::${ruleset.name} is now live for Firestore in ${project}.`);
