import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/site/CtaBand";
import { ListingCard, type ListingCardData } from "@/components/listing/ListingCard";
import { MarketList } from "@/components/site/MarketList";
import { earlyAccessLeft } from "@/lib/billing/early-access";
import { loadDemand } from "@/lib/market";

export const revalidate = 300;

/** An illustrative card so brokers see what brands see. Not a real brokerage. */
const SAMPLE: ListingCardData = {
  name: "Lakeshore Sales & Marketing (sample)",
  logoUrl: null,
  hq: "Chicago, IL",
  coverage: "Midwest",
  channels: ["Conventional grocery", "Natural & specialty"],
  retailers: [{ name: "Kroger", freq: "weekly" }, { name: "Meijer", freq: "weekly" }, { name: "Jewel-Osco", freq: "monthly" }, { name: "Hy-Vee", freq: "monthly" }],
  verified: true,
  fit: { score: 86, reasons: ["Covers Kroger weekly", "Meijer weekly", "KeHE"] },
};

const HOW_BRANDS_FIND = [
  ["Purvey's own brands", "Brands Purvey advises are sent to Bench first when they need a broker."],
  ["purveycpg.com", "Bench sits in Purvey's main navigation, in front of founders reading about launch and retail strategy."],
  ["Free for brands, forever", "No paywall on search, profiles or messaging, so brands come back every time they open a new account."],
];

export const metadata: Metadata = {
  title: "For brokers",
  description: "List your brokerage on Purvey Bench for $100 a month, or $900 a year (25% off) for early access brokerages. Brands find you by the retailers you actually call on.",
};

const INCLUDED = [
  ["A full public profile", "Retailers grouped by call frequency, coverage map, channels, distributors, categories, terms and current lines."],
  ["Ranked by fit, never by payment", "Every listing pays the same. Position comes only from how well you match a brand’s brief."],
  ["A managed inbox", "Brands message you directly. Reply, decline with a reason, keep private notes and saved replies, and work as a team."],
  ["Analytics", "How often you’re shown in search, profile views, contact reveals, saves and new conversations, for 30 and 90 days."],
  ["Purvey verification", "Ask Purvey to check your references and retailer relationships and earn the Verified badge."],
  ["No lead fees", "No tiers, no contact caps, no paid placement. Cancel any time from the billing portal."],
];

export default async function ForBrokers() {
  const [demand, left] = await Promise.all([loadDemand(30), earlyAccessLeft()]);
  return (
    <>
      <section className="bench-section is-cream bench-grid-2 bench-hero-split">
        <div className="bench-stack">
          <div className="text_title">For brokers</div>
          <h1 className="bench-h-section" style={{ maxWidth: "40rem" }}>Get found by brands that fit the accounts you already call on.</h1>
          <p className="bench-lede">
            Purvey Bench is where emerging food and beverage brands look for brokers. They search by retailer, region,
            channel and distributor, so a complete listing puts you in front of the right brands.
          </p>
          {left > 0 && (
            <p className="bench-spots"><strong>Early access:</strong> $900 for your first year, 25% off ($75 a month). Only {left} early access deal{left === 1 ? "" : "s"} still available.</p>
          )}
          <div className="bench-row" style={{ marginTop: 8 }}>
            <Link href="/sign-up?role=broker" className="button w-button">Start your listing</Link>
            <Link href="/pricing" className="button bench-btn-ghost w-button">See pricing</Link>
          </div>
        </div>
        <div className="bench-stack" style={{ gap: 10 }}>
          <p className="bench-eyebrow" style={{ margin: 0 }}>What brands see</p>
          <ListingCard data={SAMPLE} />
          <p className="bench-small bench-muted" style={{ margin: 0 }}>Sample listing. The fit score is calculated against each brand&rsquo;s own brief.</p>
        </div>
      </section>
      <section className="bench-section bench-stack" aria-labelledby="how-find">
        <h2 id="how-find" className="bench-h-section">How brands find Bench</h2>
        <div className="bench-grid-3">
          {HOW_BRANDS_FIND.map(([title, body]) => (
            <div key={title} className="bench-card bench-stack">
              <h3 style={{ fontSize: "1.5rem", lineHeight: 1.33 }}>{title}</h3>
              <p className="bench-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
      {demand.length > 0 && (
        <section className="bench-section bench-stack">
          <MarketList items={demand} audience="brokers" heading="Where brands want representation"
            lede="Retailers and distributors that brands on Bench are seeking brokers for right now, from their briefs and searches. Counts are of different brands; an account shows once three or more brands want it." />
          <div><Link href="/sign-up?role=broker" className="button w-button">List your brokerage</Link></div>
        </section>
      )}
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
      <CtaBand audience="brokers" />
    </>
  );
}
