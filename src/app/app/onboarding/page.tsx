import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "./OnboardingForm";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your account", robots: { index: false } };

export default async function Onboarding() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.org) redirect("/app");
  const supabase = await createClient();
  const { data: states } = await supabase.from("states").select("code, name").order("name");
  const m = session.metadata;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return (
    <section className="bench-section is-cream">
      <div className="bench-grid-2" style={{ alignItems: "start" }}>
        <div className="bench-stack">
          <div className="text_title">Almost done</div>
          <h1 className="bench-h-section">Tell us about your company</h1>
          <p className="bench-lede">
            You can invite teammates once your account is set up. Brands are free, always. Brokers set up their
            listing next, then go live for $100 a month.
          </p>
        </div>
        <div className="bench-card is-white">
          <OnboardingForm
            states={states ?? []}
            defaults={{
              type: str(m.signup_role) === "broker" ? "broker" : str(m.signup_role) === "brand" ? "brand" : undefined,
              name: session.name || str(m.full_name) || str(m.name),
              orgName: str(m.signup_org_name),
            }}
          />
        </div>
      </div>
    </section>
  );
}
