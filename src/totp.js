// Time-based one-time codes (RFC 6238, the same scheme authenticator apps use).
// Each person in a circle has their own secret; their phone shows the current code,
// and anyone in the circle can check a code read out on a call.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomSecret(bytes = 20) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = '';
  for (const b of raw) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function b32decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(c);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

const keyCache = new Map();
async function hmacKey(secret) {
  if (!keyCache.has(secret)) {
    keyCache.set(secret, crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']));
  }
  return keyCache.get(secret);
}

export async function totp(secret, t = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(t / 1000 / step);
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 2 ** 32));
  dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), buf));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

// Accept the current window and one either side, to tolerate clock drift and reading delay.
export async function verifyTotp(secret, code) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length !== 6) return false;
  for (const d of [0, -1, 1]) {
    if ((await totp(secret, Date.now() + d * 30000)) === clean) return true;
  }
  return false;
}

export const secondsLeft = () => 30 - (Math.floor(Date.now() / 1000) % 30);
