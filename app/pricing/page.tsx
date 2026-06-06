import Link from "next/link";
import { Anchor, Check, ArrowLeft, Mail, Waves } from "lucide-react";
import { config, isStripeReady } from "@/lib/config";
import WaitlistForm from "@/components/WaitlistForm";

export const metadata = {
  title: "Pricing — BeachCast",
  description: "Free for casual beachgoers. Pro for surfers and coastal obsessives.",
};

export default function PricingPage() {
  const stripeReady = isStripeReady();
  const checkoutHref = config.stripeProLink || "#waitlist";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-ocean-800 flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, #22d3ee 0%, transparent 50%), radial-gradient(circle at 80% 20%, #06b6d4 0%, transparent 40%)",
        }}
      />

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-12 flex flex-col gap-10">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 text-sm w-fit"
          >
            <ArrowLeft size={16} />
            Back to search
          </Link>
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 mb-1">
              <Waves size={28} className="text-cyan-400" />
              <h1 className="text-4xl font-bold text-slate-100 tracking-tight">
                BeachCast
              </h1>
            </div>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              {config.productTagline}
            </p>
          </div>
        </header>

        {/* Pricing grid */}
        <section className="grid md:grid-cols-2 gap-6">
          {/* Free tier */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-8 flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">Free</h2>
              <p className="text-slate-400 text-sm mt-1">For casual beachgoers</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold text-slate-100">$0</span>
              <span className="text-slate-500">/forever</span>
            </div>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2 text-slate-300">
                <Check size={18} className="text-cyan-400 mt-0.5 shrink-0" />
                {config.freeLimits.searchesPerDay} beach searches per day
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <Check size={18} className="text-cyan-400 mt-0.5 shrink-0" />
                Save up to {config.freeLimits.favorites} favorite beaches
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <Check size={18} className="text-cyan-400 mt-0.5 shrink-0" />
                Real-time conditions: waves, swell, wind, UV
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <Check size={18} className="text-cyan-400 mt-0.5 shrink-0" />
                Safety score + rip current risk
              </li>
            </ul>
            <Link
              href="/"
              className="mt-auto text-center bg-slate-700/60 hover:bg-slate-700 text-slate-100 font-medium rounded-xl py-3 transition-colors"
            >
              Start searching
            </Link>
          </div>

          {/* Pro tier */}
          <div className="relative bg-gradient-to-br from-cyan-500/10 to-blue-600/10 border-2 border-cyan-400/40 rounded-2xl p-8 flex flex-col gap-5">
            <div className="absolute -top-3 right-6 bg-cyan-400 text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
              MOST POPULAR
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">
                {config.productName}
              </h2>
              <p className="text-cyan-300 text-sm mt-1">For surfers & coastal obsessives</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold text-slate-100">
                ${config.proPriceUsd}
              </span>
              <span className="text-slate-400">/{config.proCadence}</span>
            </div>
            <ul className="space-y-2.5 text-sm">
              {config.proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-slate-200">
                  <Check size={18} className="text-cyan-400 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {stripeReady ? (
              <a
                href={checkoutHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-auto text-center bg-cyan-400 hover:bg-cyan-300 text-slate-900 font-bold rounded-xl py-3 transition-colors"
              >
                Get Pro — ${config.proPriceUsd}/{config.proCadence}
              </a>
            ) : (
              <div className="mt-auto">
                <button
                  type="button"
                  disabled
                  className="w-full text-center bg-slate-700/40 text-slate-500 font-medium rounded-xl py-3 cursor-not-allowed"
                >
                  Checkout opens soon
                </button>
                <p className="text-xs text-slate-500 text-center mt-2">
                  Drop your email — we&apos;ll ping you the moment Pro goes live.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Waitlist / FAQ */}
        <section id="waitlist" className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-8">
          {!stripeReady && (
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                <Mail size={20} className="text-cyan-400" />
                Be the first to know
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Drop your email — we&apos;ll email you the moment Pro goes live (and give you a launch-week discount).
              </p>
              <div className="mt-4">
                <WaitlistForm source="pricing" />
              </div>
            </div>
          )}

          <div className={stripeReady ? "" : "mt-8 pt-8 border-t border-slate-700/40"}>
            <h3 className="text-lg font-semibold text-slate-100">FAQ</h3>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-slate-200 font-medium">What data do you use?</dt>
                <dd className="text-slate-400 mt-1">
                  Open-Meteo marine + weather APIs, plus NOAA swell models. No paid keys required.
                </dd>
              </div>
              <div>
                <dt className="text-slate-200 font-medium">Where is my data stored?</dt>
                <dd className="text-slate-400 mt-1">
                  Favorites live in your browser (localStorage). We don&apos;t track you.
                </dd>
              </div>
              <div>
                <dt className="text-slate-200 font-medium">Can I cancel anytime?</dt>
                <dd className="text-slate-400 mt-1">
                  Yes. Pro is month-to-month via Stripe. Cancel from your email receipt — no questions.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <footer className="text-center text-xs text-slate-500">
          Built by surfers, for surfers. <Anchor size={12} className="inline" /> BeachCast
        </footer>
      </div>
    </main>
  );
}
