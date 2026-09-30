# Verth: two-factor authentication for people

**Live demo:** https://umeshdk22.github.io/asli/

Verth is a prototype that stops **fake-CEO and deepfake payment fraud**. Before an employee pays, changes bank details or resets a password, one tap asks the real person, on their own registered phone, whether they really sent the request.

> Concept prototype. All people, companies and data in the demo are fictional.

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
- **Rolling codes:** the prototype derives a code from a shared secret and the current 30-second time window, and accepts the previous window to tolerate clock drift. A production version would use standard TOTP (RFC 6238) with per-pair secrets stored in the device's secure enclave.
- **Fail-safe defaults:** unanswered checks expire, and the result is "don't act".
- **Mapped threats:** MITRE ATT&CK T1656 (Impersonation) and T1566 (Phishing), and business email compromise.

### Prototype limitations

This is a single-page demo that simulates both phones in one browser. It has no backend, real push notifications, enrolment or authentication. A production build would need device enrolment, signed push messages, TOTP secret management, and Slack/Teams integration.

## Tech

A single self-contained `index.html` (HTML, CSS and vanilla JavaScript) with no build step, hosted on GitHub Pages.

## Author

**[@Umeshdk22](https://github.com/Umeshdk22)**, cybersecurity analyst (SOC). Feedback from people in finance, HR and security teams is very welcome. Please open an issue.
