import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/site/CtaBand";

export const metadata: Metadata = {
  title: "For brokers",
  description: "List your brokerage on Purvey Bench for $100 a month, flat. Brands find you by the retailers you actually call on.",
};

const INCLUDED = [
  ["A full public profile", "Retailers grouped by call frequency, coverage map, channels, distributors, categories, terms and current lines."],
  ["Ranked by fit, never by payment", "Every listing pays the same. Position comes only from how well you match a brand’s brief."],
  ["A managed inbox", "Brands message you directly. Reply, decline with a reason, keep private notes and saved replies, and work as a team."],
  ["Analytics", "How often you’re shown in search, profile views, contact reveals, saves and new conversations, for 30 and 90 days."],
  ["Purvey verification", "Ask Purvey to check your references and retailer relationships and earn the Verified badge."],
  ["No lead fees", "No tiers, no contact caps, no paid placement. Cancel any time from the billing portal."],
];

export default function ForBrokers() {
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">For brokers</div>
        <h1 className="bench-h-section" style={{ maxWidth: "40rem" }}>Get found by brands that fit the accounts you already call on.</h1>
        <p className="bench-lede">
          Purvey Bench is where emerging food and beverage brands look for brokers. They search by retailer, region,
          channel and distributor, so a complete listing puts you in front of the right brands.
        </p>
        <div className="bench-row" style={{ marginTop: 8 }}>
          <Link href="/sign-up?role=broker" className="button w-button">Start your listing</Link>
          <Link href="/pricing" className="button bench-btn-ghost w-button">See pricing</Link>
        </div>
      </section>
      <section className="bench-section bench-stack">
        <h2 className="bench-h-section">What’s included for $100 a month</h2>
        <div className="bench-grid-3">
          {INCLUDED.map(([title, body]) => (
            <div key={title} className="bench-card bench-stack">
              <h3 style={{ fontSize: "1.5rem", lineHeight: 1.33 }}>{title}</h3>
              <p className="bench-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
