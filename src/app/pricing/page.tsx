import type { Metadata } from "next";
import Link from "next/link";
import { Comparison } from "@/components/site/Comparison";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = { title: "Pricing", description: "Purvey Bench is free for brands and brokers. No subscriptions, tiers, lead fees or paid placement." };

export const revalidate = 3600;

export default async function Pricing() {
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Pricing</div>
        <h1 className="bench-h-section">Free for brands. Free for brokers.</h1>
        <p className="bench-lede" style={{ margin: 0 }}>No subscriptions, no card on file, no lead fees and no paid placement. Bench is how Purvey connects good brands with good brokers.</p>
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
          <div className="bench-price">Free</div>
          <p className="bench-muted">A full listing with your retailers, coverage and terms, a managed inbox and analytics. No tiers, contact caps, lead fees or paid placement, and never asked for payment details.</p>
          <div><Link href="/sign-up?role=broker" className="button w-button">List your brokerage free</Link></div>
        </div>
      </section>
      <Comparison />
      <CtaBand />
    </>
  );
}
