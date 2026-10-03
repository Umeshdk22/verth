# Connecting Razorpay to Verth

Takes about 30 minutes. You'll need: your Razorpay dashboard, the Firebase / Google Cloud console for `verth-ece65`, and a free Cloudflare account.

**Golden rule:** the Key Secret, webhook secret and service-account file go **only** into Cloudflare's "Secret" fields. Never paste them into GitHub, the app, WhatsApp, email or a chat.

```
Verth app ──(signed-in request)──▶ Cloudflare Worker ──▶ Razorpay (create subscription)
   │                                     ▲  │
   └──── Razorpay Checkout (UPI/card) ───┘  └──▶ Firebase (sets plan = paid)
Razorpay ──(signed webhook: charged / halted / cancelled)──▶ Worker ──▶ Firebase
```

## 1. Razorpay: plans and keys

Do this in **Test mode** first (toggle at the top of the dashboard), then repeat in **Live mode** at step 6.

1. **Subscriptions → Plans → Create plan**, three times:

   | Plan name | Billing | Amount |
   |---|---|---|
   | Verth Personal | Monthly, every 1 month | ₹149 |
   | Verth Family | Monthly, every 1 month | ₹199 |
   | Verth Team | Monthly, every 1 month | ₹299 (whole organisation, unlimited people) |

   Copy each **plan ID** (starts with `plan_`). Plan IDs aren't secret.
   If you can't see *Subscriptions*, ask Razorpay support to enable Subscriptions on your account.
2. **Account & Settings → API Keys → Generate key.** Copy the **Key ID** (`rzp_test_…`) and **Key Secret**. The secret is shown only once.

## 2. Firebase: a service account that can only touch the database

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts?project=verth-ece65>.
2. **Create service account** → name `verth-payments` → **Create and continue**.
3. Role: **Cloud Datastore User** → **Done**. (This can read and write the database and nothing else.)
4. Click the new account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads. You'll paste its whole contents into Cloudflare, then **delete the file**.

## 3. Cloudflare: the payments worker

1. Sign up free at <https://dash.cloudflare.com/sign-up> (no card needed).
2. **Workers & Pages → Create → Create Worker** → name it `verth-pay` → **Deploy**.
3. **Edit code** → delete everything → paste the contents of [`worker/src/index.js`](worker/src/index.js) → **Deploy**.
4. **Settings → Variables and Secrets → Add**:

   | Type | Name | Value |
   |---|---|---|
   | Text | `FIREBASE_PROJECT_ID` | `verth-ece65` |
   | Text | `ALLOWED_ORIGIN` | `https://umeshdk22.github.io` |
   | Text | `PLAN_PERSONAL` | your Personal plan ID |
   | Text | `PLAN_FAMILY` | your Family plan ID |
   | Text | `PLAN_TEAM` | your Team plan ID |
   | **Secret** | `RAZORPAY_KEY_ID` | Key ID |
   | **Secret** | `RAZORPAY_KEY_SECRET` | Key Secret |
   | **Secret** | `RAZORPAY_WEBHOOK_SECRET` | a long random password you make up (save it for step 4) |
   | **Secret** | `FIREBASE_SERVICE_ACCOUNT` | the whole contents of the JSON file |

   Click **Deploy** after adding them.
5. Copy the worker address shown at the top, like `https://verth-pay.yourname.workers.dev`.

## 4. Razorpay: webhook

**Account & Settings → Webhooks → Add new webhook**

- URL: `https://verth-pay.yourname.workers.dev/webhook`
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
- Active events: tick every **subscription.\*** event (authenticated, activated, charged, completed, updated, pending, halted, cancelled, paused, resumed).

## 5. Switch it on in Verth

1. Send Claude **only the worker address** (or put it in `src/config.js` yourself): `PAYMENTS = { api: 'https://verth-pay.yourname.workers.dev' }`. The Content-Security-Policy in `app.html` is then narrowed to that exact address.
2. **Firebase console → Firestore → Rules:** paste the latest [`firestore.rules`](firestore.rules) and **Publish**.
3. Test in the app (Plan tab → Subscribe) with a Razorpay test card or the test UPI ID `success@razorpay` (see Razorpay's test-mode docs). Check that:
   - the plan shows **Active** with a renewal date;
   - **Cancel subscription** shows "Renewal cancelled";
   - in Razorpay, **Webhooks → your webhook** shows deliveries with status 200.

## 6. Go live

Switch the Razorpay dashboard to **Live mode** and repeat step 1 (live plans and live keys) and step 4 (live webhook). In Cloudflare, replace the three plan IDs and three Razorpay secrets with the live ones. Pay ₹29 once yourself to confirm, then refund it from **Transactions → Payments → Refund**.

## 7. Email codes for logging in (Brevo)

Verth logs people in with a 6-digit code sent to their email. The same worker sends and checks the codes.

1. Create a free account at **brevo.com** (300 emails a day free). Under **Senders, domains & dedicated IPs → Senders**, add and verify the email address codes should come from. Once Verth has its own domain, authenticate the domain there too, so codes come from e.g. `codes@yourdomain.in` and don't land in spam.
2. Brevo → **SMTP & API → API keys → Generate a new API key**. Copy it once.
3. Cloudflare → `verth-pay` → **Settings → Variables and Secrets**:
   - Secret `BREVO_API_KEY`: the key from step 2.
   - Secret `OTP_SECRET`: any long random text (40+ letters and numbers). Never share it.
   - Text variable `MAIL_FROM`: the sender address you verified in step 1.
4. Google Cloud → **IAM & Admin → IAM** → the service account you made for payments (step 2) → **Edit** → **Add another role** → **Firebase Authentication Admin** → Save. (It lets the worker find or create the account for an email and mark it as verified.)
5. Paste the latest `worker/src/index.js` into the worker and **Deploy**.

## 8. AI answers in Verth Helper (Google Gemini, optional)

1. Open **aistudio.google.com** → sign in with your Google account → **Get API key → Create API key**. Copy it once.
2. Cloudflare → `verth-pay` → **Settings → Variables and Secrets** → add a **Secret** `GEMINI_API_KEY` with that key.
3. Deploy. Without the key, the helper still answers from its built-in guide.

The key stays on the server; each network can ask 40 AI questions an hour, and there's a daily ceiling (`AI_DAILY_CAP`, default 1500).

## 9. "I'm not a robot" check (Cloudflare Turnstile, optional)

1. Cloudflare dashboard → **Turnstile** → **Add widget**. Name `Verth`, hostname `umeshdk22.github.io` (and later your own domain), mode **Managed**. Create.
2. The **Site key** is public: put it in `src/config.js` as `TURNSTILE_SITE_KEY` and publish the site.
3. The **Secret key** goes only into the worker: Secret `TURNSTILE_SECRET`. Deploy.

Set both, or neither: with only the secret set, nobody can log in by email.

## 10. Mobile number check by SMS (2Factor, optional)

New accounts verify their mobile number with a 6-digit SMS code. It stays off until you add the key.

1. Create an account at https://2factor.in and add prepaid credit (₹500 is plenty to start).
2. Copy your **API key** from the 2Factor dashboard.
3. Cloudflare → Workers → verth-pay → Settings → Variables and Secrets → **Add** → type **Secret**,
   name `TWOFACTOR_API_KEY`, value = the API key. Deploy.
4. Optional: `TWOFACTOR_TEMPLATE` (a text variable) if 2Factor gives you an approved SMS template name,
   and `SMS_DAILY_CAP` (default 150 SMS a day across all users) to cap spending.
5. Test with your own number: Plan tab → "Verify now".

Verth makes and checks the codes itself and limits them per account, per number, per network and per day,
so bots can't use up your SMS credit. One mobile number can verify only one Verth account.

## If something goes wrong

- **"Couldn't reach the payment service"**: check the worker address in `config.js`, and that `ALLOWED_ORIGIN` is exactly `https://umeshdk22.github.io` (no slash at the end).
- **Paid but the plan didn't switch on**: Cloudflare → worker → **Logs**, and Razorpay → Webhooks → delivery attempts. The worker re-syncs from Razorpay on every webhook, so fixing a setting and clicking **Resend** on a delivery fixes the plan.
- **Rotate a leaked secret**: generate a new Razorpay key or service-account key, update it in Cloudflare, then delete the old one.
