# Verth: two-factor authentication for people

**Website:** https://umeshdk22.github.io/verth/ · **App:** https://umeshdk22.github.io/verth/app.html · **Demo:** https://umeshdk22.github.io/verth/demo.html

Verth is a prototype that stops **fake-CEO and deepfake payment fraud**. Before an employee pays, changes bank details or resets a password, one tap asks the real person, on their own registered phone, whether they really sent the request.

> Early product (v0.1). All people and companies in the demo are fictional.

---

## The problem

Attackers no longer need to hack systems when they can impersonate the people who run them:

- **Fake CEO on WhatsApp.** A new number with the boss's photo messages Accounts: *"I'm in a meeting. Transfer ₹4,80,000 before 3 pm. Keep this between us."* This scam is very common in Indian companies.
- **Voice cloning.** A convincing clone of an executive's voice needs only a few seconds of public audio.
- **Deepfake video calls.** In the widely reported Arup case, staff were deceived by a video call full of deepfaked colleagues and sent about US$25 million.

Real-time deepfake detection is not reliable enough for ordinary businesses, and mainstream meeting platforms don't provide it. The control that security guidance consistently recommends is **out-of-band verification**: confirm the request through a separate, trusted channel. In practice, that advice lives in policy documents that nobody remembers under pressure, and employees feel awkward questioning a senior person.

## What Verth does

| Feature | How it works | Why it matters |
|---|---|---|
| **Push check** | The employee taps **Verify**. The claimed sender's *registered* device asks "Did you send this?" and they answer with a fingerprint. | The answer comes from a channel the attacker doesn't control. |
| **Rolling codes between people** | Each person's app shows a 6-digit code that changes every 30 seconds (the same idea as TOTP authenticator apps). On a live call, the employee asks for the code. | A deepfake can copy a face and a voice, but not a code on someone else's phone. |
| **Fail-safe by default** | If the check isn't answered before it expires, the employee is told not to act. | Silence is never treated as approval. |
| **Audit log** | Every check records who asked, the claimed sender, the channel, the request and the outcome. | Evidence for auditors and insurers, and data for the security team. |
| **Scam reporting** | A denied request can be reported to the security team with one tap. | Turns each blocked attempt into threat intelligence. |

It also removes the social pressure: *"Company policy: the app has to verify it"* is easier to say to a CEO than *"I don't believe you."*

## Try the demo

You play both people. The left phone is **Priya (Accounts)**, the right phone is **Rajesh (the real CEO)**.

1. **Fake CEO on WhatsApp:** tap *Verify with Verth* on Priya's phone, then *No, not me* on Rajesh's phone. The payment is blocked.
2. **Real request on Teams:** the same flow, but Rajesh taps *Yes*. The request is verified in seconds.
3. **Deepfake video call:** enter the code the caller reads out. It doesn't match Rajesh's rolling code, so the fake is caught. Type the code shown on Rajesh's phone to see a genuine match.

## Security design notes

- **Threat model:** the attacker controls the inbound channel (WhatsApp, email, phone, video) and can convincingly imitate a person's face, voice and writing style. They do not control the victim's registered device.
- **Out-of-band confirmation:** verification is always sent to a device enrolled in advance, never to a number or address supplied in the suspicious message.
- **Rolling codes:** RFC 6238 TOTP codes derived per pair of people from device keys (ECDH + HKDF), bound to the circle and direction, accepting one window either side for clock drift.
- **Fail-safe defaults:** unanswered checks expire, and the result is "don't act".
- **Mapped threats:** MITRE ATT&CK T1656 (Impersonation) and T1566 (Phishing), and business email compromise.

## Scam check (new)

Paste a suspicious **SMS, WhatsApp message, email, link or phone number** and Verth explains the red flags it finds, in plain words:

- **Links:** look-alike bank and government domains (checked against official domains), look-alike letters (punycode), bare IP addresses, `@` tricks, shorteners, cheap TLDs, app downloads (`.apk`), bait words.
- **Phone numbers:** TRAI's 1600 (banks and financial firms), 1601 (service calls) and 140 (marketing) series, international numbers, invalid or spoofed-looking numbers.
- **Messages and emails:** requests for OTP/PIN (but not genuine "do not share" OTP SMS), "digital arrest" and police threats, screen-sharing apps, "scan QR to receive money", "new number" family scams, KYC updates, prizes and refunds, task-job and investment scams, parcel and electricity threats, spoofed email senders and reply-to tricks. Links and numbers inside the message are checked too.
- Every result links to **Sanchar Saathi (Chakshu)**, the **1930** helpline and **cybercrime.gov.in**.
- Checks run on the device. **Community reports** store only a SHA-256 fingerprint, never the content.
- Free accounts get **2 checks a day**, enforced by the database rules (the counter is keyed to today's date in India time and can only go up by one).

## The product (v0.2)

- **Landing page** (`index.html`): what Verth is, Scam check, a wall of real-world scam examples, the demo video, examples for organisations and families, guidelines, plans and FAQ. Optional piano soundtrack (never autoplays).
- **App** (`app.html`): real accounts and real checks between people.
  - Sign up with email (confirmation link required) or Google.
  - Welcome tour, then create an **organisation** or **family** circle, or join one with an invite code.
  - **Push checks**: the request goes to the named person's signed-in device, and they answer Yes or No in real time. Checks expire after 3 minutes.
  - **Rolling codes**: pairwise RFC 6238 codes that only the two people's devices can compute.
  - **Signed answers**: each Yes/No is signed by the answering device and verified by the requester.
  - **Admin approval** for new members and for members who move to a new device.
  - **Verification log** shared with the circle, scam reporting, and plan limits (Free: 5 people, 20 checks a month).
- **Demo** (`demo.html`): the original interactive simulation, no account needed.

### Security

Verth is designed on the assumption that attackers will try hard. New members need admin approval; names on checks are bound to real member records; every Yes/No is signed by a key that never leaves the person's device; rolling codes are pairwise (ECDH + HKDF + TOTP), so no shared secret exists in the database; and the log can't be edited or deleted. Rules and attacker scenarios are tested on every push. See [SECURITY.md](SECURITY.md) for the threat model, controls, known limits and the Firebase hardening checklist.

### Architecture

| Part | Choice |
|---|---|
| Hosting | GitHub Pages (static) |
| Auth | Firebase Authentication (email/password with email verification, Google) |
| Data and real-time updates | Cloud Firestore with snapshot listeners |
| Access control | `firestore.rules`: circle-scoped reads, only the named recipient can answer a check (once, before expiry), plan field locked, invite-code joins counted against plan limits |
| Device keys | Non-extractable P-256 keys in IndexedDB: ECDSA signs answers, ECDH + HKDF derive pairwise TOTP codes |
| Build | esbuild bundles `src/` into `assets/app.js` |

### Run it locally

```bash
npm install
npm run build          # writes assets/app.js
```

Put your Firebase web config in `src/config.js`, then serve the folder with any static server.

- `npm run test:unit` runs 22 real-world scam-check examples (`test/scamcheck.test.mjs`).
- `npm run test:rules` runs the attacker scenarios in `test/rules.test.mjs` against the Firestore emulator.
- `npm run test:e2e` drives two browsers (an employee and the CEO) plus attacker actions through the whole app, using `test/fake-firebase.js`, an in-browser stand-in for the Firebase SDK.
- Both run on every push in GitHub Actions.

### Roadmap

- Razorpay subscriptions for Family and Team plans (server-side payment confirmation).
- Background push notifications (Firebase Cloud Messaging) so checks arrive when the app is closed.
- Hardware-backed passkeys (WebAuthn) for answering checks.
- Server-side rate limiting and "sign out everywhere".

## Author

**[@Umeshdk22](https://github.com/Umeshdk22)**, cybersecurity analyst (SOC). Feedback from people in finance, HR and security teams is very welcome. Please open an issue.
