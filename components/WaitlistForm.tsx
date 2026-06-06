"use client";

import { useState } from "react";

interface Props {
  source?: string;
}

type State = "idle" | "submitting" | "success" | "error";

export default function WaitlistForm({ source = "unknown" }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setState("error");
      setMessage("Enter a valid email");
      return;
    }
    setState("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setState("success");
      setMessage("You're on the list. We'll email you when Pro goes live.");
      setEmail("");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  if (state === "success") {
    return (
      <div className="bg-cyan-500/10 border border-cyan-400/30 rounded-xl p-4 text-cyan-300 text-sm">
        ✅ {message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@surfer.com"
        disabled={state === "submitting"}
        className="flex-1 bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={state === "submitting"}
        className="bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-900 font-bold rounded-xl px-6 py-3 transition-colors"
      >
        {state === "submitting" ? "..." : "Notify me"}
      </button>
      {state === "error" && (
        <p className="text-red-400 text-sm sm:basis-full mt-1">{message}</p>
      )}
    </form>
  );
}
