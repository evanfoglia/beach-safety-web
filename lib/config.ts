// Centralized config for BeachCast / SurfCast monetization.
// All env vars are optional — the app degrades gracefully without them.

export const config = {
  // Stripe Payment Link for the Pro tier ($5/mo).
  // Create one at https://dashboard.stripe.com/payment-links
  // then paste the link here (or set NEXT_PUBLIC_STRIPE_PRO_LINK).
  stripeProLink:
    process.env.NEXT_PUBLIC_STRIPE_PRO_LINK?.trim() || "",

  // Email provider for waitlist / Pro notifications.
  // Uses Resend (https://resend.com). If missing, we fall back to
  // writing to data/waitlist.json on the local filesystem.
  resendApiKey: process.env.RESEND_API_KEY?.trim() || "",
  notifyEmail:
    process.env.NOTIFY_EMAIL?.trim() || "fogliaevan@gmail.com",

  // Product copy
  productName: "BeachCast Pro",
  productTagline: "Real-time beach safety, surf & UV — in your inbox every morning.",
  proPriceUsd: 5,
  proCadence: "month",
  freeLimits: {
    searchesPerDay: 10,
    favorites: 3,
  },
  proFeatures: [
    "Unlimited beach searches",
    "Unlimited favorite beaches",
    "Morning surf + safety email digest",
    "Voice surf briefing (ElevenLabs)",
    "Rip current + UV alerts for favorites",
    "Priority: new beaches added on request",
  ],
} as const;

export const isStripeReady = () => config.stripeProLink.length > 0;
export const isEmailReady = () => config.resendApiKey.length > 0;
