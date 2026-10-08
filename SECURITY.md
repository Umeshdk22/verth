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
- **No passwords.** People log in with Google or with a 6-digit code emailed to them, so there is no password to guess, reuse or phish. Every account's email is confirmed before any data can be read or written; this is enforced in the database rules, not only in the app.
- Email codes: drawn uniformly at random, valid for 10 minutes, used once, and stored only as an HMAC (the email address is also stored only as an HMAC). Each code allows 5 tries; every try is counted with a Firestore precondition *before* the comparison, so guesses sent at the same moment can't get around the limit. Sending is limited to one code per 30 seconds and 5 per hour per email, and 20 per hour per network. Only the Verth site's origin may call these endpoints.
- After a correct code, the worker looks up (or creates) the Firebase account for that email, marks the email as verified, and returns a one-hour Firebase custom token signed with the service account key.
- Wrong codes are also counted per email across new codes: 10 wrong in 24 hours locks that email until the next day. `/otp/verify` is limited to 60 tries per hour per network, and all code emails together are capped per day (`OTP_DAILY_CAP`, default 280, under Brevo's free 300) so nobody can burn the quota.
- **Pre-hijacking is blocked:** if someone opened an account with a victim's email and a password before the victim arrived, the first email-code login removes that password and signs out every existing session (`validSince`) before the real owner gets in. Switch off the Email/Password provider in Firebase as well.
- Messages don't reveal whether an email is registered: the same steps log in or create an account.

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
- Firestore rules: plans, seats and billing are server-only; Family circles stop at 10 people, Team circles have no practical limit (2,000).
- Tests: `test/worker.test.mjs` (forged tokens, forged signatures, someone else's payment, wrong plan IDs, non-admin purchases, forged webhooks) and the browser test of Checkout → verify → cancel.

### Verth Helper (assistant)
- Guide answers run in the browser. Typed questions are not stored.
- Text that looks like an OTP, PIN, password, card or Aadhaar number is refused before any processing.
- Optional Gemini mode uses Firebase AI Logic: no Gemini key ships to the browser, calls require App Check, and the project stays on the no-billing free tier so it cannot run up a bill. The system instruction limits answers to the Verth guide and scam safety; the model never sees account data. Output is rendered as escaped text, never HTML.

### Web security
- **No third-party requests on the website**: fonts are self-hosted, so visiting the home page tells no one else (not even Google Fonts) who you are. The clickable demo runs from a file, not inline script.
- A `/.well-known/security.txt` tells researchers how to report a problem.
- A strict **Content Security Policy** on every page: scripts only from Verth itself and Google's sign-in and App Check services, no plugins, no `<base>` changes, no form submissions, and HTTPS only.
- Verth refuses to run inside another site's frame (clickjacking).
- All user-provided text is HTML-escaped before display. Exported CSV cells that start with `=`, `+`, `-` or `@` are neutralised (formula injection).
- `strict-origin-when-cross-origin` referrer policy.
- The public pages (home, invite, demo) also refuse to be framed.
- The Verth server (Cloudflare Worker) answers only the Verth website (CORS), rate-limits login codes, AI help and UPI lookups per person and per network, checks the "I'm not a robot" token itself, and sends strict headers on every answer: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- The "I'm not a robot" box never ticks itself, waits for a slow download, and never leaves anyone stuck: after 10 seconds the server alone decides.

### Social engineering
- "Yes" takes two deliberate taps and shows a warning: nobody legitimate will ask you to approve a check over a call.
- An unanswered check means "don't act".

## Testing

- `test/rules.test.mjs`: 37 tests with over 80 attacker attempts, run directly against the Firestore emulator, bypassing the app (forged names, answering someone else's check, self-promotion to admin, joining without counting, deleting the log, weak device keys, and more).
- `test/e2e.js`: two browsers (employee and CEO) plus attacker actions: forged and replayed signatures, a stolen password on a new device, invite rotation, and joining switched off.
- Both run on every push in GitHub Actions (`.github/workflows/security.yml`).

## Automated security tools (run on every change)

- **CodeQL** (`.github/workflows/codeql.yml`, security-extended queries): scans all JavaScript for injection, XSS, unsafe crypto and other weaknesses; weekly as well.
- **Dependabot** (`.github/dependabot.yml`): weekly updates for libraries and GitHub Actions.
- **npm audit**: the build fails if any library has a known high-severity hole.
- **TruffleHog**: scans every commit for leaked, verified keys; publishing waits for it.
- **Firestore rules tests**, **server tests** and the **two-person browser test** (with attacker steps) must pass before the database rules and server are published.
- **Page audit** (`test/audit.cjs`, `test/audit-site.cjs`): every screen at phone, tablet and laptop sizes is checked for unreadable text, overflow, missing fonts, broken images and unlabeled buttons.
- GitHub Actions in the main workflow are pinned to exact commit hashes.

## Known limits (be honest with users)

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
5. **Authentication → Sign-in method:** only **Google** needs to be enabled (email codes use custom tokens from the worker). Email/Password can be switched off once no one uses it.
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

## Hardening added in October 2026 (independent review)

- **Member count can't be faked:** lowering `memberCount` must name the member being removed (`lastRemoved`), whose record must be deleted in the same write; removing a member must lower the count. The count can't go below 1.
- **Anti-flood for checks:** every check is written together with `users/{uid}/meters/checks`, and the rules allow one check per person every 5 seconds, so a member can't run up database costs for a 2000-person circle.
- **Invite records** are validated (name length, type).
- **Worker:** Google key refresh for unknown key ids at most once a minute; request size checked from `Content-Length` before reading; payment-provider error text is logged, not shown.
- **CI:** GitHub Actions are pinned to exact commit SHAs.
- **Known soft limits (by design):** free scam-check and photo-check limits are enforced by counters the rules guard, but the checks themselves run on the user's phone, so a determined user who edits the app can skip the counter. The free plan's monthly verification-check limit is enforced in the app.
- **Next step:** move Verth to its own domain. Today it shares the `umeshdk22.github.io` origin with any other GitHub Pages project on that account; a custom domain (with Cloudflare in front) also allows real security headers (HSTS, frame-ancestors, Permissions-Policy) that GitHub Pages can't send.

## Accounts, robot check and fingerprint / face login (October 2026)

- **Create account vs Log in.** Creating an account needs a name, email, mobile number (stored privately, not yet verified by SMS), agreement to the terms and a 6-digit email code. Log in only works for emails that already have an account; Google log-ins without a Verth account are undone (the stray Firebase account is deleted) and sent to Create account. Telling people "no account uses this email" is a deliberate usability choice; the per-email, per-network and daily limits slow down anyone trying to probe many addresses.
- **Robot check:** Cloudflare Turnstile on Log in and Create account when `TURNSTILE_SITE_KEY` (app) and `TURNSTILE_SECRET` (worker) are set; the worker verifies every token with Cloudflare, including the person's IP.
- **Fingerprint / face login (passkeys, WebAuthn):** the device does the biometric check; Verth stores only a public key per device. Registration needs a signed-in person and a single-use server challenge; login checks the challenge (single use, 5 minutes), the website origin, the RP ID hash, user presence *and* user verification flags, the signature (ES256 or RS256), the user handle and the signature counter, then issues a Firebase custom token. Phishing sites can't use a passkey (it's bound to the Verth domain). Up to 10 per person, removable in the Plan tab. Moving to a custom domain means turning passkeys on again there.
- **Sign out** asks paid users whether to also cancel; **Delete my account** cancels every subscription the person pays for, leaves circles where they're a member, removes passkeys, the profile and the login account.
