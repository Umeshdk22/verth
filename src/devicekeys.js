// Device-bound keys.
// Each person's device creates two key pairs that never leave it (non-extractable,
// kept in IndexedDB):
//  - ECDH P-256: combined with another member's public key to derive a secret that
//    only those two devices can compute. Rolling codes come from that pair secret,
//    so nobody else in the circle can produce your code.
//  - ECDSA P-256: signs every Yes/No answer, so an answer typed from a different
//    browser with a stolen password shows up as unsigned.
// Only the public halves are published in the member record.

import { totp } from './totp.js';

const DB = 'verth-device', STORE = 'keys';
const enc = new TextEncoder();

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); });
}

const pubJwk = async (key) => { const j = await crypto.subtle.exportKey('jwk', key); return { x: j.x, y: j.y }; };

// Returns this device's key pairs for a user, creating them the first time.
export async function deviceKeys(uid) {
  let k = await idbGet(uid);
  if (!k) {
    const dh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const sig = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    k = { dh, sig, created: Date.now() };
    await idbPut(uid, k);
  }
  return { ...k, pub: { dh: await pubJwk(k.dh.publicKey), sig: await pubJwk(k.sig.publicKey) } };
}

export async function resetDeviceKeys(uid) { await idbPut(uid, undefined); return deviceKeys(uid); }

export const samePub = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

const importPub = (p, alg, usages) => crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: p.x, y: p.y, ext: true }, alg, true, usages);

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function toB32(bytes) {
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

// Secret for codes shown by `speakerUid` to `listenerUid` in one circle.
// Both devices derive the same value; direction and circle are bound in.
const pairCache = new Map();
export async function pairSecret(myKeys, otherDhPub, circleId, speakerUid, listenerUid) {
  const id = [circleId, speakerUid, listenerUid, otherDhPub.x, otherDhPub.y, myKeys.pub.dh.x].join('|');
  if (pairCache.has(id)) return pairCache.get(id);
  const other = await importPub(otherDhPub, { name: 'ECDH', namedCurve: 'P-256' }, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: other }, myKeys.dh.privateKey, 256);
  const hk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('verth-pair-code-v1|' + circleId), info: enc.encode(speakerUid + '>' + listenerUid) }, hk, 160);
  const secret = toB32(new Uint8Array(bits));
  pairCache.set(id, secret);
  return secret;
}

export async function codeFor(myKeys, otherDhPub, circleId, speakerUid, listenerUid, t) {
  return totp(await pairSecret(myKeys, otherDhPub, circleId, speakerUid, listenerUid), t);
}

export async function checkCode(myKeys, speakerDhPub, circleId, speakerUid, myUid, code) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const secret = await pairSecret(myKeys, speakerDhPub, circleId, speakerUid, myUid);
  for (const d of [0, -1, 1]) if ((await totp(secret, Date.now() + d * 30000)) === clean) return true;
  return false;
}

// What exactly an answer signature covers. Changing any of these breaks it.
export const answerPayload = (circleId, c, status) =>
  ['verth-answer-v1', circleId, c.id, c.fromUid, c.toUid, c.summary, c.channel, String(c.expiresMs), status].join('␟');

export async function signAnswer(myKeys, payload) {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, myKeys.sig.privateKey, enc.encode(payload));
  return b64(sig);
}

export async function verifyAnswer(sigPub, payload, sigB64) {
  try {
    const key = await importPub(sigPub, { name: 'ECDSA', namedCurve: 'P-256' }, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(sigB64), enc.encode(payload));
  } catch { return false; }
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${br} on ${os}`;
}
