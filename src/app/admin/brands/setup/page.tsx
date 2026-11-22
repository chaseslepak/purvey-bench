import type { Metadata } from "next";
import Link from "next/link";
import { setUpBrand } from "./actions";
import { Flash, type FlashParams } from "../../Flash";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Set up a brand" };

const EXAMPLE = `{
  "brand": { "name": "Example Foods", "website": "examplefoods.com", "hq_city": "Austin", "hq_state": "TX" },
  "contact": { "name": "Jane Founder", "email": "jane@examplefoods.com", "phone": "555-555-5555" },
  "profile": {
    "about": "What the brand makes and why it sells.",
    "founded_year": 2021, "stage": "regional", "annual_revenue_band": "1m_5m", "current_doors": 450,
    "categories": ["Salty Snacks"], "certifications": ["gluten_free"], "storage": "ambient",
    "current_retailers": ["Kroger"], "current_distributors": ["KeHE"], "current_channels": ["Grocery"], "current_states": ["TX"],
    "target_retailers": ["H-E-B"], "target_distributors": ["UNFI"], "target_channels": ["Convenience"], "target_regions": ["midwest"], "target_states": ["OH"],
    "timeline": "now", "commission_pref": "pct_net_sales", "max_rate": 5, "trade_budget_band": "10k_50k",
    "looking_for": "What the brand wants from a broker."
  },
  "products": [
    { "name": "Sea Salt 5 oz", "size": "5 oz", "case_pack": 12, "msrp": 5.99, "wholesale": 3.25, "upc": "000000000000", "shelf_life_days": 270, "storage": "ambient" }
  ]
}`;

/** Purvey sets up a client brand's account and full profile; the owner just signs in by email link. */
export default async function SetUpBrand({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  await requireAdmin();
  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <h1 className="bench-h-section" style={{ fontSize: "1.75rem" }}>Set up a client brand</h1>
      <p className="bench-muted" style={{ margin: 0 }}>
        Creates the owner&rsquo;s account, the brand and its full profile and products. There&rsquo;s no password: owners sign in with an emailed link.
        Nothing is sent until you press &ldquo;Send sign-in link&rdquo; under <Link className="bench-link" href="/admin/accounts">Accounts</Link>. Leave out <code>contact</code> to build the profile first and add the owner later.
        Running it again with the same owner email updates that brand. Retailers, channels and categories not on Bench&rsquo;s lists are kept as typed.
      </p>
      <form action={setUpBrand} className="bench-stack">
        <label className="bench-label" htmlFor="spec">Brand spec (JSON)</label>
        <textarea id="spec" name="spec" className="bench-input" rows={28} required placeholder={EXAMPLE} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} />
        <div><button type="submit" className="button w-button">Set up brand</button></div>
      </form>
    </section>
  );
}
