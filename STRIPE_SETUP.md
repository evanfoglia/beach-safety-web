# BeachCast Pro — Stripe setup (2 min)

This doc explains how to turn on the "Get Pro" checkout button on `/pricing`.

## TL;DR
1. Get a Stripe secret key (test or live).
2. Run `node scripts/create-stripe-link.mjs` → prints a Payment Link.
3. Set `NEXT_PUBLIC_STRIPE_PRO_LINK=<link>` in your hosting env.
4. Redeploy. The pricing page auto-detects the env var and shows the real checkout button.

If the env var is missing, `/pricing` shows a "Checkout opens soon" state plus an email waitlist.

## Step 1 — Stripe secret key
- Sign in: https://dashboard.stripe.com
- Test mode: Developers → API keys → Reveal test key (`sk_test_...`)
- Live mode: same page → Live key (`sk_live_...`) — only switch when you're ready to charge real cards.

## Step 2 — Create the Payment Link

```bash
cd projects/beach-safety-web
STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-link.mjs
```

The script creates a product, a $5/mo recurring price, and a Payment Link. Output looks like:

```
Stripe Payment Link for BeachCast Pro: https://buy.stripe.com/test_xxxxx
```

## Step 3 — Wire it up
Add to `.env.local` (local dev) **and** your hosting provider's env (Vercel → Settings → Environment Variables):

```
NEXT_PUBLIC_STRIPE_PRO_LINK=https://buy.stripe.com/test_xxxxx
RESEND_API_KEY=re_xxxxx         # optional, for waitlist owner-notify emails
NOTIFY_EMAIL=fogliaevan@gmail.com
```

The link env var is `NEXT_PUBLIC_*` so it's safe to expose to the browser (Stripe Payment Links are public by design).

## Step 4 — Verify
1. Restart `npm run dev` (or redeploy).
2. Open `/pricing` — the Pro card should show a "Get Pro — $5/month" button.
3. Click it → should land on a Stripe Checkout page.
4. Use Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC) to test a real checkout end-to-end.

## Webhooks (optional, for tier-gating)
This app doesn't currently gate features server-side (favorites use localStorage, so trust-the-client is fine for v1). If you add server-gated features later, listen to:
- `checkout.session.completed` → mark user as Pro
- `customer.subscription.deleted` → downgrade

A minimal Next.js webhook route is left as a follow-up.

## Costs
- Stripe: 2.9% + 30¢ per successful transaction. On $5/mo that's $0.45/transaction → $4.55 net per paying user per month.
- Resend (optional): free up to 3k emails/mo, then $20/mo.

## Going live
1. Run the script with a live key: `STRIPE_SECRET_KEY=sk_live_... node scripts/create-stripe-link.mjs`
2. Swap the test link for the live one in your env config.
3. Test with a real card in a $1 test product first if you're nervous.
