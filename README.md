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

## Job & exam offer check (new)

Built from a real story: the founder paid ₹1,500 "exam fee" to a fake company with a look-alike website. Paste the offer email or message (and optionally the company name) and Verth checks:

- **Fees for exams, interviews, training, laptops or deposits.** Real employers never charge candidates; TCS and Infosys state this publicly. Government exam fees get "pay only on the official .gov.in/.nic.in portal" advice instead.
- **Who really sent it:** free email providers, and sender domains checked against the official recruitment domains of 25+ large employers (TCS `@tcs.com`, Infosys `@infosys.com`, Wipro, Accenture, Cognizant, HCLTech and others).
- **Look-alike company websites** (e.g. `tcs-careers-india.in`).
- **Other hiring red flags:** surprise "selection", WhatsApp/Telegram interviews, Aadhaar/PAN/bank documents up front, too-good-to-be-true pay.

## Demo videos (English and हिन्दी)

Four short demo videos on the home page, with a topic switch and a language switch: **Scam check** and **For organisations**, each in **English** (British male voice) and **Hindi** (male voice), with burned-in subtitles in the same language. They're recorded from the real app, timed to the narration, and encoded as H.264 at a steady 30 fps with fast start. How they're made: [`tools/video/`](tools/video/README.md).

## For organisations: how employees join

1. The admin signs up, taps **My organisation**, and names the company. Verth creates a private 8-character invite code.
2. The admin taps **Copy invite message** in the Circle tab and sends it to the office group.
3. Each employee signs in, taps **I have an invite code**, enters it with their role, and Verth binds their account to their own phone.
4. The admin approves each person; a leaked code alone can't get anyone in.
5. The team agrees: **no Verth check, no payment** above a set amount.

## Photo & screenshot check

Not everyone can copy and paste. In Scam check, tap **Photo or screenshot**, take a photo of the message or pick a screenshot (or on Android, **Share → Verth** straight from WhatsApp or the Gallery).

- **Reads the picture on the phone itself** (Tesseract OCR compiled to WebAssembly, loaded only when needed). The picture is never uploaded.
- **Finds QR codes** in the picture (jsQR). A UPI QR code is decoded to show exactly who it pays and how much, and "scan to receive money" is flagged as the scam it is.
- The words found go through the same message and job checks, with the read text shown so people can see what Verth saw.
- **5 free photo checks per account**, enforced by Firestore rules; unlimited on Personal, Family and Team.

## Verth Helper (AI assistant)

A **“Need help?”** button on every page opens Verth Helper, a chat assistant for anyone who finds the app confusing:

- **Big "What happened?" buttons** (I have a screenshot, a strange message, a number called me, a job offer, someone is asking for money, I lost money) so nobody needs to know the right words, plus a **🔊 Listen** button that reads any answer aloud.
- **Understands plain questions**, including Hinglish (“account kaise banaye”, “kitne ka plan hai”), and answers in simple steps with buttons that take you straight there (Open Verify, See plans, Install…).
- **Built-in guide first:** 27 topics answered instantly, offline and free (sign-up, circles, checks, codes, new phone, plans, what to do if you’ve been scammed: 1930 and cybercrime.gov.in).
- **Safety rails:** it refuses OTPs, PINs, passwords and card/Aadhaar numbers (they’re never processed or sent anywhere), and anything pasted that looks like a link, number or message is handed to Scam check instead of being judged by a chatbot.
- **Optional Gemini mode** via Firebase AI Logic (Gemini Developer API free tier, App Check protected, no secret key in the browser). Gemini is restricted to the Verth guide by its system instructions and limited to 15 answers per person per day.

## Paid plans with Razorpay

Monthly subscriptions (UPI Autopay or card) through Razorpay Checkout, with a small **Cloudflare Worker** (`worker/`) as the only thing allowed to mark a plan as paid:

- The app sends a signed-in request (Firebase ID token, verified against Google's keys) to start a subscription; only circle admins can buy Family or Team.
- After Checkout, the worker checks Razorpay's HMAC signature, then **re-reads the subscription from Razorpay** and writes the plan to Firestore with a least-privilege service account. Signed webhooks (charged, halted, cancelled…) keep it in sync; the browser's word is never trusted.
- Firestore rules stop the app from writing plans, seats or billing. Family circles stop at 10 people, Team (₹299/month) has no limit on people, and Family/Team members get unlimited scam checks only while they're active members of a paid circle.
- Cancel any time from the Plan tab (renewal stops at the end of the paid month).
- Policy pages Razorpay requires: [Pricing](pricing.html), [Terms](terms.html), [Privacy](privacy.html), [Refunds](refunds.html), [Shipping](shipping.html), [Contact](contact.html).

Setup: [PAYMENTS-SETUP.md](PAYMENTS-SETUP.md).

## Install on your phone

Verth is an installable web app (manifest + service worker). On Android, after installing, any SMS, WhatsApp message, email or link can be sent to Verth with **Share → Verth** (Web Share Target), which opens Scam check pre-filled. Shared text is removed from the address bar immediately and never stored.

## The product (v0.3)

- **Landing page** (`index.html`): what Verth is, Scam check, a wall of real-world scam examples, the demo video, examples for organisations and families, guidelines, plans and FAQ. Optional piano soundtrack (never autoplays).
- **App** (`app.html`): real accounts and real checks between people.
  - Log in with a 6-digit code sent to your email (no passwords), or with Google.
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

- `npm run test:unit` runs 28 real-world scam-check and job-offer examples (`test/scamcheck.test.mjs`).
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
