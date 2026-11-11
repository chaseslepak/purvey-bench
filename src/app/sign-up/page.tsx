import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { MarketList } from "@/components/site/MarketList";
import { env } from "@/lib/env";
import { loadCoverage, loadDemand } from "@/lib/market";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const initialRole = role === "brand" || role === "broker" ? role : undefined;
  const [demand, coverage] = await Promise.all([loadDemand(16), loadCoverage(16)]);
  return (
    <section className="bench-section is-cream bench-signup">
      <div className="bench-grid-2" style={{ alignItems: "start" }}>
        <div className="bench-stack">
          <div className="text_title">Purvey Bench</div>
          <h1 className="bench-h-section">Create your account</h1>
          <p className="bench-lede">
            Brands search, see full broker profiles and message brokers for free. Brokers list for $100 a month,
            or $300 a year paid up front (75% off). No tiers, no lead fees, no paid placement.
          </p>
          <div className="bench-for-brokers">
            <MarketList compact items={demand} audience="brokers" heading="Brands are seeking brokers for"
              lede="Retailers and distributors that three or more brands on Bench want representation for." />
          </div>
          <div className="bench-for-brands">
            <MarketList compact items={coverage} audience="brands" heading="Our brokers call on"
              lede="Retailers and distributors covered by brokers listed on Bench today." />
          </div>
        </div>
        <div className="bench-card is-white bench-stack">
          <SignUpForm initialRole={initialRole} turnstileSiteKey={env.turnstileSiteKey} />
          <div className="bench-row" style={{ justifyContent: "center" }}><span className="bench-small bench-muted">or</span></div>
          <GoogleButton next="/app/onboarding" label="Sign up with Google" />
          <p className="bench-small">
            Already have an account? <Link className="bench-link" href="/sign-in">Sign in</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
