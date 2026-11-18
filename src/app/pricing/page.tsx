import type { Metadata } from "next";
import Link from "next/link";
import { Comparison } from "@/components/site/Comparison";
import { CtaBand } from "@/components/site/CtaBand";
import { currentOffer, nextTierNote, offerLine } from "@/lib/billing/launch";

export const metadata: Metadata = { title: "Pricing", description: "Brands are free, always. Brokers list for $100 a month, flat, with launch offers for the first 35 brokerages. No tiers, lead fees or paid placement." };

export const revalidate = 60;

export default async function Pricing() {
  const offer = await currentOffer();
  const line = offerLine(offer);
  const next = nextTierNote(offer);
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Pricing</div>
        <h1 className="bench-h-section">Simple, flat and the same for everyone.</h1>
      </section>
      <section className="bench-grid-2">
        <div className="bench-section bench-stack">
          <div className="bench-eyebrow">Brands</div>
          <div className="bench-price">Free</div>
          <p className="bench-muted">Search, full profiles and contact details, briefs with fit ranking, a shortlist and messaging. Never asked for payment details.</p>
          <div><Link href="/sign-up?role=brand" className="button w-button">Create a free account</Link></div>
        </div>
        <div className="bench-section bench-stack">
          <div className="bench-eyebrow">Brokers</div>
          <div className="bench-price">$100<span className="bench-price_per"> / month</span></div>
          {line && <p className="bench-spots" style={{ margin: 0 }}>{line}</p>}
          {next && <p className="bench-small bench-muted" style={{ margin: 0 }}>{next}</p>}
          <p className="bench-muted">One flat listing. No tiers, contact caps, lead fees or paid placement. Choose a plan when you sign up, then build your listing. Cancel any time.</p>
          <div><Link href="/sign-up?role=broker" className="button w-button">Start your listing</Link></div>
        </div>
      </section>
      <Comparison />
      <CtaBand />
    </>
  );
}
