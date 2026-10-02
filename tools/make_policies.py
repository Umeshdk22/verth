"""Builds Verth's policy pages (terms, privacy, refunds, shipping, contact, pricing).

Razorpay asks every merchant website for these pages. Edit the text here, then run:
    python3 tools/make_policies.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPDATED = "1 October 2026"
OWNER = "Umesh"            # use your full legal name exactly as in your Razorpay KYC
EMAIL = "umeshdk22@gmail.com"
PLACE = "India"            # add your city, e.g. "Bengaluru, Karnataka, India"

PAGES = {
    "terms": ("Terms and Conditions", f"""
<p>These terms apply to Verth (the website at umeshdk22.github.io/verth and the Verth app), run by {OWNER}, {PLACE} (“Verth”, “we”). By creating an account you agree to them.</p>
<h2>What Verth does</h2>
<p>Verth helps people avoid scams. <b>Scam check</b> looks at a message, email, job offer, link or phone number you paste and points out warning signs. <b>Verify</b> lets people in a family or organisation “circle” confirm a request with the real person on their own registered device.</p>
<h2>Verth gives guidance, not guarantees</h2>
<p>Scam check results are automated warnings based on known patterns. A “no obvious red flags” result does not prove something is safe, and a warning does not prove it is a scam. Always confirm through official channels before paying or sharing anything. Verth is not a bank, payment service, law-enforcement agency or legal adviser.</p>
<h2>Your account</h2>
<ul><li>You must be at least 18, or use Verth with a parent or guardian’s permission.</li>
<li>Give a real email address and keep your password and devices secure. Never sign in to Verth on someone else’s device.</li>
<li>Circle admins decide who joins their circle and are responsible for approving the right people.</li></ul>
<h2>Fair use</h2>
<p>Don’t use Verth to harass anyone, to impersonate others, to test or plan scams, to attack the service, or to break any law. We may suspend accounts that do.</p>
<h2>Paid plans and payments</h2>
<ul><li>Paid plans (Personal, Family and Team) are monthly subscriptions at the prices shown on the <a href="pricing.html">Pricing</a> page, in Indian Rupees.</li>
<li>Payments are processed by Razorpay using UPI Autopay, cards or other methods Razorpay offers. Verth never sees or stores your card number, UPI PIN or bank login.</li>
<li>Your subscription renews automatically each month until you cancel. You can cancel any time in the app (Plan → Cancel subscription); the plan stays on until the end of the month you paid for.</li>
<li>If a renewal payment fails and Razorpay can’t collect it after retrying, the plan returns to Free.</li>
<li>We’ll give at least 30 days’ notice by email before any price change applies to you.</li>
<li>Refunds follow our <a href="refunds.html">Cancellation and Refund Policy</a>.</li></ul>
<h2>Availability and liability</h2>
<p>We work to keep Verth available and secure but can’t promise it will never be interrupted. To the extent the law allows, Verth is not liable for losses caused by scams, by acting or not acting on a Scam check result, or by the service being unavailable; and our total liability for any claim is limited to the amount you paid Verth in the 3 months before the claim.</p>
<h2>Ending your use</h2>
<p>You can stop using Verth at any time. To delete your account, open the Plan tab, choose <b>Delete my account</b> and type DELETE: any subscription you pay for stops renewing and your account is removed. You can also email {EMAIL}. When you sign out while paying for a plan, Verth asks whether you want to cancel it too; signing out alone doesn’t cancel it.</p>
<h2>Changes and law</h2>
<p>We may update these terms; the date below shows the latest version and we’ll tell you by email about important changes. These terms are governed by the laws of India, and disputes are subject to the courts of India.</p>
"""),
    "privacy": ("Privacy Policy", f"""
<p>This policy explains what Verth collects and why. Verth is run by {OWNER}, {PLACE}. We follow India’s Digital Personal Data Protection Act, 2023.</p>
<h2>What we collect</h2>
<ul><li><b>Account:</b> your name, email address, mobile number, when you agreed to these terms, and whether your email is confirmed (handled by Google Firebase Authentication). Your mobile number is kept private: it isn’t shown to anyone in your circles and isn’t shared or used for marketing.</li>
<li><b>Fingerprint / face login (optional):</b> your phone or computer checks your fingerprint, face or screen lock itself. Verth never receives any biometric data; it only stores a public security key and the device name you turned it on from, so it can recognise your device. You can remove it any time in the Plan tab.</li>
<li><b>Circles and checks:</b> the circles you create or join, your role, the verification requests you send or answer (who, what was asked in your words, the channel, the answer and time).</li>
<li><b>Device keys:</b> public keys that tie your answers to your own device, plus a simple device label like “Chrome on Android”. Private keys never leave your device.</li>
<li><b>Scam check:</b> the text you paste, and any screenshot or photo you choose, is checked on your device and is <b>not</b> uploaded or stored. We keep only a count of checks (daily for text, in total for photos). If you report something as a scam, we store a one-way scrambled fingerprint of it, never the text.</li>
<li><b>Payments:</b> your subscription ID, plan, status and renewal date. Card, UPI and bank details are collected and processed by Razorpay, not by Verth.</li>
<li><b>Verth Helper:</b> common questions are answered on your device from the built-in guide. Questions the guide can’t answer are sent, with the last few messages of that chat, through our server to Google Gemini to write a reply. We don’t store the chat, and anything that looks like an OTP, PIN, password or card number is never sent. Please don’t type personal details into the helper.</li>
<li><b>Email login codes:</b> to log in with a code, your email address is sent to our email provider (Brevo) to deliver the code. We keep only a scrambled fingerprint of your email and code for a short time to check it and to stop abuse.</li></ul>
<h2>What we don’t do</h2>
<p>Verth never reads your SMS, WhatsApp, calls or email. We don’t sell your data, show ads, or use your data for marketing by others.</p>
<h2>Who processes data for us</h2>
<p>Google Firebase (accounts and database), Razorpay (payments), Cloudflare (our server for payments, login codes and AI help), Brevo (sends login codes by email), GitHub Pages (website hosting), and Google Gemini (AI answers in Verth Helper). Each processes data only to provide their service.</p>
<h2>Keeping and deleting data</h2>
<p>We keep your data while your account is active. The verification log of a circle is kept for the circle’s records. To see, correct or delete your data, or to withdraw consent, email {EMAIL}; we reply within 7 days and complete deletion within 30 days, except records we must keep by law (such as payment records).</p>
<h2>Security</h2>
<p>Data is protected by Firebase security rules, device-bound signatures and encrypted connections. No system is perfectly secure; if a breach affects you, we’ll tell you and the authorities as the law requires.</p>
<h2>Children</h2>
<p>People under 18 should use Verth with a parent or guardian, for example as part of a family circle.</p>
<h2>Grievance officer</h2>
<p>{OWNER}, {EMAIL}. Questions or complaints about your data are answered within 7 days.</p>
"""),
    "refunds": ("Cancellation and Refund Policy", f"""
<h2>Cancelling</h2>
<p>You can cancel a paid plan at any time in the Verth app: <b>Plan → Cancel subscription</b>. Cancelling stops future renewals. Your plan stays active until the end of the month you’ve already paid for, then switches back to Free. No further payments are taken after you cancel.</p>
<p>You can also cancel your UPI Autopay mandate from your UPI app; this stops renewals the same way.</p>
<h2>Refunds</h2>
<p>Subscriptions are billed monthly in advance. We don’t give partial refunds for the unused part of a month after you cancel. We give a <b>full refund</b> of the affected payment if:</p>
<ul><li>you were charged twice for the same month;</li>
<li>you were charged after you had cancelled;</li>
<li>a technical problem on our side meant your paid plan didn’t work, and we couldn’t fix it within 3 days of you telling us; or</li>
<li>you ask within 7 days of your first-ever payment for a plan (a 7-day money-back guarantee for new subscribers).</li></ul>
<h2>How to ask for a refund</h2>
<p>Email <a href="mailto:{EMAIL}">{EMAIL}</a> from your Verth account email with the payment date and amount (or the Razorpay payment ID from your receipt). We reply within 2 working days. Approved refunds are sent to the original payment method through Razorpay and usually reach you within 5–7 working days, depending on your bank.</p>
"""),
    "shipping": ("Shipping and Delivery Policy", f"""
<p>Verth is an online service. <b>Nothing is shipped</b> and there are no physical goods.</p>
<h2>Delivery of paid plans</h2>
<p>Paid plans are delivered digitally to your Verth account. Your plan switches on as soon as your payment is confirmed, usually within a few seconds and always within 1 hour. You’ll see it on the Plan tab in the app, and Razorpay emails you a receipt.</p>
<p>If your plan hasn’t switched on within 1 hour of a successful payment, email <a href="mailto:{EMAIL}">{EMAIL}</a> with your payment details and we’ll fix it or refund you.</p>
<h2>Service area</h2>
<p>Verth is available online across India.</p>
"""),
    "contact": ("Contact Us", f"""
<p>Verth is built and run by <b>{OWNER}</b>, {PLACE}.</p>
<div class="contact-card"><p><b>Email</b><br><a href="mailto:{EMAIL}">{EMAIL}</a></p>
<p><b>Replies</b><br>Within 2 working days (Monday to Saturday).</p>
<p><b>Report a bug or security issue</b><br><a href="https://github.com/Umeshdk22/verth/issues" rel="noopener">github.com/Umeshdk22/verth/issues</a> (for security issues, email instead and don’t post details publicly).</p></div>
<h2>Beware of fake “Verth support”</h2>
<p>Verth has no phone helpline and will never call you, ask for an OTP, UPI PIN or password, or ask you to install another app. Anyone who does is a scammer.</p>
<h2>Lost money to a scam?</h2>
<p>Call the National Cyber Crime Helpline <b>1930</b> straight away, or report at <a href="https://cybercrime.gov.in" rel="noopener">cybercrime.gov.in</a>.</p>
"""),
    "pricing": ("Pricing", """
<p>All prices are in Indian Rupees, per month, and include applicable taxes. Paid plans renew monthly until you cancel.</p>
<div class="price-table">
<div><h2>Free</h2><p class="amt">₹0</p><ul><li>Up to 5 people in a circle</li><li>20 verification checks a month</li><li>2 scam checks a day</li><li>5 free photo / screenshot checks</li></ul></div>
<div><h2>Personal</h2><p class="amt">₹149 <small>/ month</small></p><ul><li>Unlimited scam checks for you</li><li>Unlimited photo / screenshot checks</li><li>Everything in Free</li></ul></div>
<div><h2>Family</h2><p class="amt">₹199 <small>/ month</small></p><ul><li>Up to 10 people</li><li>Unlimited verification checks</li><li>Unlimited scam and photo checks for everyone in the circle</li><li>Log export</li></ul></div>
<div><h2>Team</h2><p class="amt">₹299 <small>/ month</small></p><ul><li>Your whole organisation, no limit on people</li><li>Everything in every plan</li><li>Unlimited checks, scam and photo checks for everyone</li><li>Log export for auditors</li><li>Priority support</li></ul></div>
</div>
<p>Pay with UPI Autopay, cards and other methods through Razorpay. See the <a href="refunds.html">Cancellation and Refund Policy</a> and <a href="terms.html">Terms</a>.</p>
"""),
}

NAV = [("pricing", "Pricing"), ("terms", "Terms"), ("privacy", "Privacy"), ("refunds", "Refunds"), ("shipping", "Shipping"), ("contact", "Contact")]

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{title} for Verth, the scam-check and verification app.">
<meta name="theme-color" content="#2A137A">
<title>{title} · Verth</title>
<link rel="icon" href="assets/icon-192.png">
<link rel="stylesheet" href="assets/fonts.css">
<link rel="stylesheet" href="assets/verth.css">
<style>
.legal{{max-width:820px;margin:0 auto;padding:0 20px 64px}}
.pol-hero{{color:#fff;padding:22px 0 90px;background:linear-gradient(180deg,rgba(18,8,47,.6),rgba(18,8,47,.35) 55%,rgba(18,8,47,.75)),url(assets/bg-dusk.webp) center bottom/cover,#2A137A}}
.pol-hero .in{{max-width:820px;margin:0 auto;padding:0 20px}}
.pol-hero .brand{{color:#fff}}
.pol-hero h1{{color:#fff;font-size:clamp(38px,6vw,56px);margin-top:34px}}
.pol-hero .upd{{color:rgba(255,255,255,.8)}}
.pol-hero .btn{{background:#fff;color:#1E0F55;border-color:#fff}}
.legal article{{margin-top:-60px;position:relative}}
.pol-hero header{{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-block:6px 26px}}
.legal article{{background:#fff;box-shadow:var(--shadow);border:1px solid var(--line);border-radius:18px;padding:28px clamp(18px,4vw,40px);display:flex;flex-direction:column;gap:14px}}

.legal h2{{font-size:22px;margin-top:10px}}
.legal ul{{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}}
.pol-hero .upd{{font-size:14px;margin:6px 0 0}}
.legal nav.pol{{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:22px;font-size:14px}}
.legal nav.pol a{{color:var(--muted)}} .legal nav.pol a[aria-current]{{color:var(--accent)}}
.contact-card{{background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;gap:12px}}
.price-table{{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}}
.price-table>div{{background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:16px}}
.price-table .amt{{font-family:var(--display);font-size:30px;font-weight:400;color:var(--accent)}}
.price-table small{{font-size:13px;color:var(--muted);font-family:var(--body)}}
</style>
</head>
<body>
<div class="pol-hero"><div class="in">
<header><a class="brand" href="./"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7 3v5c0 4.4-3 8.1-7 9.9-4-1.8-7-5.5-7-9.9v-5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.8 12l2.2 2.2 4.2-4.6" fill="none" stroke="currentColor" stroke-width="2"/></svg>Verth</a>
<a class="btn small" href="app.html">Open the app</a></header>
<h1>{title}</h1>
<p class="upd">Last updated {updated}</p>
</div></div>
<div class="legal">
<article>
{body}
</article>
<nav class="pol" aria-label="Policies">{nav}</nav>
</div>
</body>
</html>
"""

for slug, (title, body) in PAGES.items():
    cur = ' aria-current="page"'
    nav = " ".join(f'<a href="{s}.html"{cur if s == slug else ""}>{t}</a>' for s, t in NAV)
    (ROOT / f"{slug}.html").write_text(TEMPLATE.format(title=title, body=body.strip(), updated=UPDATED, nav=nav), encoding="utf-8")
    print("wrote", slug + ".html")
