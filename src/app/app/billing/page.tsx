import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalButton } from "./PortalButton";
import { PLANS } from "@/lib/billing/stripe";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing", robots: { index: false } };

const STATUS: Record<string, string> = {
  active: "Active", trialing: "Active", past_due: "Payment failed", canceled: "Cancelled", unpaid: "Unpaid",
  incomplete: "Waiting for payment", incomplete_expired: "Checkout expired", paused: "Paused",
};
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—");

export default async function Billing() {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "broker") redirect("/app");
  const db = await createClient();
  const { data: sub } = await db.from("subscriptions").select("*").eq("org_id", session.org.id).maybeSingle();
  const graceEnds = sub?.past_due_since ? new Date(new Date(sub.past_due_since).getTime() + 7 * 864e5).toISOString() : null;

  return (
    <section className="bench-section bench-stack">
      <div className="text_title">{session.org.name}</div>
      <h1 className="bench-h-section">Billing</h1>
      <p className="bench-lede" style={{ margin: 0 }}>Bench Listing: {PLANS.monthly.price} a month, or {PLANS.annual.price} a year paid up front (25% off, early access). No tiers, lead fees or paid placement.</p>
      {sub?.comped ? (
        <p className="bench-notice" style={{ margin: 0 }}>Your listing is complimentary, courtesy of Purvey. There&rsquo;s nothing to pay.</p>
      ) : !sub?.stripe_subscription_id ? (
        <p className="bench-notice" style={{ margin: 0 }}>
          You haven&rsquo;t chosen a plan yet. <Link className="bench-link" href="/app/listing">Choose a plan</Link> to start building your listing.
        </p>
      ) : (
        <>
          <dl className="bench-dl">
            <dt>Plan</dt><dd>{sub.plan === "annual" ? `Annual · ${PLANS.annual.price} a year` : sub.plan === "monthly" ? `Monthly · ${PLANS.monthly.price} a month` : "Bench Listing"}</dd>
            <dt>Status</dt><dd>{STATUS[sub.status ?? ""] ?? sub.status}{sub.cancel_at_period_end ? " · cancels at period end" : ""}</dd>
            <dt>{sub.cancel_at_period_end || sub.status === "canceled" ? "Listed until" : sub.plan === "annual" ? "Renews on" : "Next billing date"}</dt><dd>{date(sub.current_period_end)}</dd>
          </dl>
          {sub.status === "past_due" && graceEnds && (
            <p className="bench-notice is-warn" style={{ margin: 0 }}>Your last payment failed. Your listing stays live until {date(graceEnds)}. Update your card to keep it live.</p>
          )}
          {sub.cancel_at_period_end && (
            <p className="bench-notice" style={{ margin: 0 }}>Your listing stays live until {date(sub.current_period_end)}, then pauses. Your listing and data are kept, so resubscribing restores everything.</p>
          )}
        </>
      )}
      {session.org.memberRole === "owner" ? (sub?.stripe_customer_id ? <PortalButton /> : null) : (
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Only an owner on your team can manage billing.</p>
      )}
    </section>
  );
}
