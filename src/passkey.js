// Fingerprint / face login with passkeys (WebAuthn). The phone or computer does the fingerprint,
// face or screen-lock check itself; Verth's server only ever receives a public key and signatures.
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.create;

// Friendly messages for what the browser says when someone cancels or something's missing.
export function passkeyError(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'AbortError') return 'Cancelled. Nothing was changed.';
  if (n === 'InvalidStateError') return 'Fingerprint / face login is already turned on for this device.';
  if (n === 'NotSupportedError' || n === 'SecurityError') return 'This browser or device can’t do fingerprint / face login. Use the email code instead.';
  return e?.message || 'Something went wrong. Try again.';
}

// call(path, body) → JSON from the Verth server (signed-in calls add the ID token themselves).
export async function registerPasskey(call, label) {
  const o = await call('/passkey/register-options', {});
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: fromB64(o.challenge), rp: o.rp,
      user: { id: fromB64(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: (o.exclude || []).map((id) => ({ type: 'public-key', id: fromB64(id) })),
      attestation: 'none', timeout: 60000,
    },
  });
  const r = cred.response;
  if (typeof r.getPublicKey !== 'function' || !r.getPublicKey()) throw new Error('Please update your browser to turn on fingerprint / face login.');
  return call('/passkey/register', {
    id: toB64(cred.rawId), clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.getAuthenticatorData()),
    publicKey: toB64(r.getPublicKey()), alg: r.getPublicKeyAlgorithm(), label,
  });
}

// Returns a sign-in token for the account that owns the passkey the person picks.
export async function loginWithPasskey(call) {
  const o = await call('/passkey/login-options', {});
  const cred = await navigator.credentials.get({ publicKey: { challenge: fromB64(o.challenge), rpId: o.rpId, userVerification: 'required', timeout: 60000 } });
  const r = cred.response;
  const { token } = await call('/passkey/login', {
    id: toB64(cred.rawId), clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.authenticatorData),
    signature: toB64(r.signature), userHandle: r.userHandle ? toB64(r.userHandle) : '',
  });
  return token;
}
