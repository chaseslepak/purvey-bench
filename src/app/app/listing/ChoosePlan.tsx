"use client";

import { useState, useTransition } from "react";
import { startCheckout } from "./actions";
import type { Plan } from "@/lib/billing/stripe";

type PlanView = { key: Plan; label: string; price: string; per: string; note: string; cta: string };

const INCLUDED = [
  "A full public profile: retailers you call on, states, channels, terms",
  "Ranked by fit in every brand search. Payment never buys position",
  "Unlimited brand messages, deal rooms and teammates",
  "Purvey verification badge and brand reviews",
];

/** Brokers choose a plan and pay before they build their listing. */
export function ChoosePlan({ plans, isOwner, lapsed, banner, offer }: { plans: PlanView[]; isOwner: boolean; lapsed: boolean; banner: string | null; offer: string | null }) {
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  function go(plan: Plan) {
    setError(null);
    setChosen(plan);
    start(async () => {
      const r = await startCheckout(plan).catch(() => ({ ok: false as const, error: "Couldn't open checkout. Check your connection and try again." }));
      if (!r.ok) { setError(r.error); return; }
      // Top-level navigation: Stripe Checkout must never load inside the purveycpg.com iframe.
      if (r.checkoutUrl) (window.top ?? window).location.href = r.checkoutUrl;
      else window.location.reload();
    });
  }

  return (
    <div className="bench-stack">
      <section className="bench-section is-cream bench-stack" aria-labelledby="plan-h">
        <div className="text_title">{lapsed ? "Your listing is paused" : "Step 1 of 2"}</div>
        <h1 id="plan-h" className="bench-h-section">{lapsed ? "Choose a plan to go live again." : "Choose your plan, then build your listing."}</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          {lapsed
            ? "Everything you built is saved. Restart billing and your listing is back in brand searches right away."
            : "One flat listing, the same for every brokerage. Pay once you pick a plan; your listing goes live the moment you publish it."}
        </p>
        {banner && <p className="bench-notice" role="status" style={{ margin: 0 }}>{banner}</p>}
      </section>

      <div className={plans.length > 1 ? "bench-grid-2 bench-plans" : "bench-plans"}>
        {plans.map((p) => (
          <section key={p.key} className="bench-section bench-stack bench-plan" aria-labelledby={`plan-${p.key}`}>
            <h2 id={`plan-${p.key}`} className="bench-eyebrow" style={{ margin: 0 }}>{p.label}</h2>
            <div className="bench-price">{p.price}<span className="bench-price_per"> {p.per}</span></div>
            <p className="bench-muted" style={{ margin: 0 }}>{p.note}</p>
            {offer && !lapsed && <p className="bench-spots" role="status">{offer}</p>}
            {isOwner ? (
              <button type="button" className="button bench-btn-block w-button" disabled={pending} onClick={() => go(p.key)}>
                {pending && chosen === p.key ? "Opening secure checkout…" : p.cta}
              </button>
            ) : null}
          </section>
        ))}
      </div>
      {!isOwner && <p className="bench-notice" style={{ margin: 0 }}>Only an owner on your team can choose a plan. Ask them to sign in and pick one; you can build the listing together after that.</p>}
      {error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{error}</p>}

      <section className="bench-section bench-stack" aria-labelledby="inc-h">
        <h2 id="inc-h" className="bench-eyebrow" style={{ margin: 0 }}>Your listing includes</h2>
        <ul className="bench-checklist">
          {INCLUDED.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Secure checkout by Stripe. Cancel any time from Billing; your listing stays live until the end of the period you paid for.</p>
      </section>
    </div>
  );
}
