import type { Metadata } from "next";
import Link from "next/link";
import { Comparison } from "@/components/site/Comparison";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = { title: "Pricing", description: "Brands are free, always. Brokers list for $100 a month, flat." };

export default function Pricing() {
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
          <div className="bench-price">$100<span style={{ fontSize: "1.5rem" }}> / month</span></div>
          <p className="bench-muted">One flat listing. No tiers, contact caps, lead fees or paid placement. Cancel any time.</p>
          <div><Link href="/sign-up?role=broker" className="button w-button">Start your listing</Link></div>
        </div>
      </section>
      <Comparison />
      <CtaBand />
    </>
  );
}
