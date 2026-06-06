#!/usr/bin/env node
/**
 * create-stripe-link.mjs
 *
 * One-shot script: create a Stripe Payment Link for the BeachCast Pro tier.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-link.mjs
 *
 * Then paste the printed link into .env.local as NEXT_PUBLIC_STRIPE_PRO_LINK
 * (or set it in your hosting provider's env config).
 */

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("✗ STRIPE_SECRET_KEY is not set.");
  console.error("  Get one at https://dashboard.stripe.com/apikeys (test mode is fine).");
  console.error("  Then run: STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-link.mjs");
  process.exit(1);
}

const PRODUCT_NAME = "BeachCast Pro";
const PRICE_USD = 5;
const CURRENCY = "usd";
const INTERVAL = "month"; // month | year
const SUCCESS_URL =
  process.env.SUCCESS_URL || "https://beachcast.app/?upgraded=1";
const CANCEL_URL =
  process.env.CANCEL_URL || "https://beachcast.app/pricing?canceled=1";

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

console.log("→ Creating Stripe product…");
const product = await stripe("POST", "/products", {
  name: PRODUCT_NAME,
  description: "Unlimited searches, voice briefings, daily email digest.",
});
console.log(`  ✓ Product: ${product.id}`);

console.log("→ Creating recurring price ($5/mo)…");
const price = await stripe("POST", "/prices", {
  product: product.id,
  currency: CURRENCY,
  unit_amount: PRICE_USD * 100,
  recurring: { interval: INTERVAL },
});
console.log(`  ✓ Price: ${price.id}`);

console.log("→ Creating Payment Link…");
const link = await stripe("POST", "/payment_links", {
  "line_items[0][price]": price.id,
  "line_items[0][quantity]": 1,
  "after_completion[type]": "redirect",
  "after_completion[redirect][url]": SUCCESS_URL,
  "metadata[source]": "create-stripe-link.mjs",
});
console.log(`  ✓ Payment Link: ${link.url}`);

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Stripe Payment Link for BeachCast Pro: ${link.url}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("\nNext steps:");
console.log("1. Add to .env.local:  NEXT_PUBLIC_STRIPE_PRO_LINK=" + link.url);
console.log("2. Add to your hosting provider's env config (Vercel/Netlify).");
console.log("3. Restart `npm run dev` (or redeploy) — the pricing page will auto-show the checkout button.");
console.log(`4. Add a cancel URL redirect at: ${CANCEL_URL}`);
console.log("\nTip: this was a TEST-mode link. Repeat with sk_live_... for production.");
