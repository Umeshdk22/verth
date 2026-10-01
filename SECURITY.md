# Verth security

Verth protects decisions about money, bank details and account access, so it is built on the assumption that attackers will try hard. This document describes what Verth defends against, how, and what is still open.

## Threat model

| Attacker | What they can do | What they must not be able to do |
|---|---|---|
| **Outside scammer** | Message or call a victim from any number; copy names, photos, voices and faces | See any circle, send checks, or produce a valid code |
| **Someone holding a leaked invite code** | Ask to join a circle | See anything or send checks before an admin approves them |
| **Someone with a stolen password** | Sign in from a new browser | Answer a check with a trusted "Yes", or show a valid code, without everyone being told and (for non-admins) an admin re-approving them |
| **Malicious circle member** | Use the app normally, or write to the database directly with their own account | Pretend to be another member, answer checks meant for someone else, change or delete the log, make themselves admin, change the plan, or compute another member's code |
| **Malicious website** | Embed Verth, inject scripts, or trick users into clicks | Run scripts inside Verth, frame it, or submit forms elsewhere |
| **Bots and scripts** | Call Firebase APIs directly | Bypass the security rules (always enforced server-side); with App Check on, they are rejected outright |

## Controls

### Accounts
- Email/password accounts must confirm their email before any data can be read or written; this is enforced in the database rules, not only in the app.
- Passwords need at least 10 characters. Common passwords and passwords that contain the email name are refused, and a server-side password policy can be switched on in Firebase (see the checklist).
- Error messages don't reveal whether an email is registered.

### Circles and membership
- **Admin approval.** Joining with an invite code creates a *pending* membership. Pending people can read only their own membership record, and can't see the circle, its people or its log, or send or receive checks.
- **Invite codes** are 8 characters from a 31-character alphabet (about 8.5 × 10¹¹ combinations), generated with a CSPRNG using rejection sampling. They can be looked up one at a time but never listed. Admins can change the code (the old one stops working immediately) or switch joining off.
- **Plan limits** are enforced in the rules: `memberCount` can only move by exactly one, tied to the caller's own membership record being created or deleted.
- Nobody can make themselves admin, change their name after joining, change the plan, or remove an admin.
- Members are shown with their verified email, so admins and colleagues can tell two people with the same name apart.

### Checks
- The sender and recipient names on a check **must equal the real member records**, so nobody can send a check "from the CEO" unless they are the CEO.
- Checks can only be sent between two *active* members, never to yourself, and must expire within 10 minutes (the app uses 3).
- Only the named recipient can answer, only once, only before expiry, and only with a device signature attached. Nothing else on the check can be changed.
- The log can't be edited or deleted by anyone.

### Device-bound keys
- Each person's device creates two P-256 key pairs with Web Crypto. The private keys are **non-extractable** and never leave the device's browser storage; only the public keys are published.
- **Signed answers.** Every Yes/No is signed with ECDSA over the circle, check ID, sender, recipient, request text, channel, expiry and decision. The requester's app verifies the signature against the recipient's registered key. A "Yes" without a valid signature is shown as **"Don’t trust this answer"** and treated as not confirmed. A signature copied from another check doesn't verify.
- **Pairwise codes.** Rolling codes are TOTP (RFC 6238) derived through ECDH + HKDF from the two people's device keys, bound to the circle and to the direction. Only those two devices can compute the code. No code secret is stored in the database.
- **New devices are visible.** Registering a new device bumps a counter that can only go up. Everyone sees a "new device" warning for 7 days, and non-admin members go back to *pending* until an admin re-approves them.

### Scam check
- Analysis runs entirely in the browser; pasted text is never uploaded.
- Community reports store only a SHA-256 fingerprint of the normalised item under `reports/{fingerprint}/by/{uid}`: one report per person, no content, no editing. Reporter IDs are opaque random account IDs.
- The free daily limit is enforced by the rules: the counter document must be named after today's date (India time), can only start at 1 and go up by exactly 1, and stops at 2 unless the account's plan (which only the server can change) is paid.
- Limits: someone determined can run the open-source analysis code offline, and many fake accounts could inflate a report count. Report counts are shown as a signal, never as a verdict.

### Photo checks
- Pictures are read in the browser (WebAssembly OCR and QR decoding); no image or extracted text is uploaded. Engine files are served from the site itself; the page's CSP adds only `'wasm-unsafe-eval'` and `blob:` image previews.
- Shared pictures (Android share target) are held briefly in a private Cache Storage entry and deleted as soon as the app picks them up.
- The free photo allowance is a server-checked counter (`users/{uid}/meters/photos`): starts at 1, goes up by exactly 1, stops at 5 unless the account or an active paid circle is on a paid plan. Unreadable pictures don't count.

### Payments
- Razorpay secrets and the Firebase service account live only in Cloudflare Worker secrets. The service account has the single role *Cloud Datastore User*.
- Every app request to the worker carries a Firebase ID token; the worker verifies its RS256 signature against Google's published keys, the project, issuer, expiry and a confirmed email. Only the Verth site's origin is allowed by CORS.
- Checkout results are checked with Razorpay's HMAC-SHA256 signature (constant-time comparison), and the subscription must carry the caller's own account ID (set by the worker when it was created). Webhooks are checked with the webhook secret over the raw body.
- Plan state is always taken from the subscription as fetched from Razorpay, and only for Verth's own plan IDs. Out-of-order or replayed events can't flip a newer paid subscription off.
- Firestore rules: plans, seats and billing are server-only; Team circles are capped at the seats paid for.
- Tests: `test/worker.test.mjs` (forged tokens, forged signatures, someone else's payment, wrong plan IDs, non-admin purchases, forged webhooks) and the browser test of Checkout → verify → cancel.

### Verth Helper (assistant)
- Guide answers run in the browser. Typed questions are not stored.
- Text that looks like an OTP, PIN, password, card or Aadhaar number is refused before any processing.
- Optional Gemini mode uses Firebase AI Logic: no Gemini key ships to the browser, calls require App Check, and the project stays on the no-billing free tier so it cannot run up a bill. The system instruction limits answers to the Verth guide and scam safety; the model never sees account data. Output is rendered as escaped text, never HTML.

### Web security
- A strict **Content Security Policy** on every page: scripts only from Verth itself and Google's sign-in and App Check services, no plugins, no `<base>` changes, no form submissions, and HTTPS only.
- Verth refuses to run inside another site's frame (clickjacking).
- All user-provided text is HTML-escaped before display. Exported CSV cells that start with `=`, `+`, `-` or `@` are neutralised (formula injection).
- `strict-origin-when-cross-origin` referrer policy.

### Social engineering
- "Yes" takes two deliberate taps and shows a warning: nobody legitimate will ask you to approve a check over a call.
- An unanswered check means "don't act".

## Testing

- `test/rules.test.mjs`: 37 tests with over 80 attacker attempts, run directly against the Firestore emulator, bypassing the app (forged names, answering someone else's check, self-promotion to admin, joining without counting, deleting the log, weak device keys, and more).
- `test/e2e.js`: two browsers (employee and CEO) plus attacker actions: forged and replayed signatures, a stolen password on a new device, invite rotation, and joining switched off.
- Both run on every push in GitHub Actions (`.github/workflows/security.yml`).

## Known limits (be honest with users)

- **Rate limiting** needs a server (Cloud Functions on the Blaze plan). Until then, abuse is limited by approval, plan caps and Firebase's own quotas.
- **Signing out everywhere** after a stolen password needs the Admin SDK (server). For now: reset the password, and the device-change warnings still apply.
- **Device keys live in the browser.** Clearing site data creates a new device, which is visible to others (by design). Hardware-backed passkeys (WebAuthn) are the next step.
- **Admins are highly trusted.** An admin's device change is announced but not re-approved. Use a strong password and Google 2-step verification for admin accounts.
- **The code check result is recorded by the checker's app.** The code itself can't be faked, but the log entry is only as honest as the person recording it.
- **Paid plans** will only be switched on by a server that confirms Razorpay payments; the app can never change a plan itself.

## Firebase and GitHub settings checklist

Do these once in the consoles. They add protection the code can't provide by itself.

**Firebase console**
1. **Firestore → Rules:** paste the contents of `firestore.rules` and click **Publish**.
2. **Authentication → Settings → User actions:** turn on **Email enumeration protection**.
3. **Authentication → Settings → Password policy:** enforce it, minimum length **10**, require lowercase, uppercase and a number.
4. **Authentication → Settings → Authorized domains:** keep only `umeshdk22.github.io` and your `…firebaseapp.com` domain (remove `localhost`).
5. **Authentication → Sign-in method:** only **Email/Password** and **Google** enabled.
6. **App Check:** register the web app with **reCAPTCHA Enterprise**, send the site key so it can be added to `src/config.js`, watch the metrics for a day, then **Enforce** for Firestore and Authentication.

7a. *(Optional, for Gemini answers in Verth Helper)* **AI Logic → Get started → Gemini Developer API**. Keep the project on the free Spark plan (no billing account). After App Check is set up, set `AI_HELPER.enabled = true` in `src/config.js`.

**Google Cloud console** (same Google account)
7. **APIs & Services → Credentials → Browser key:** set *Website restrictions* to `https://umeshdk22.github.io/*` and `https://YOUR-PROJECT.firebaseapp.com/*`.
8. Turn on **2-step verification** for the Google account that owns the Firebase project.

**GitHub**
9. Turn on **two-factor authentication** for your GitHub account.
10. **Settings → Branches:** protect `main` and require the **Security tests** checks to pass.
11. **Settings → Code security:** turn on Dependabot alerts and secret scanning.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** button on this repository (Security tab) rather than a public issue.
