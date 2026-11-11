import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandBuilder } from "./BrandBuilder";
import type { Step } from "@/lib/brand-profile";
import { loadBrand } from "@/lib/brand-data";
import { getReference } from "@/lib/reference";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brand profile", robots: { index: false } };
const STEPS: Step[] = ["company", "products", "today", "goals", "dataroom"];

export default async function BrandProfilePage({ searchParams }: { searchParams: Promise<{ step?: string; welcome?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "brand") redirect("/app");
  const sp = await searchParams;
  const db = await createClient();
  const [b, ref] = await Promise.all([loadBrand(db, session.org.id), getReference()]);
  if (!b) redirect("/app");
  return (
    <>
      <section className="bench-section is-cream bench-stack" style={{ gap: 8 }}>
        <div className="text_title">Brand profile</div>
        <h1 className="bench-h-section" style={{ margin: 0 }}>{b.org.name}</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          {sp.welcome
            ? "Welcome to Purvey Bench. Tell brokers who you are and where you want to be. It takes about 10 minutes, saves as you go, and brokers see it only after you message them."
            : "What brokers see when you message them: your brand, products, where you sell now, where you want to be, and your data room."}
        </p>
      </section>
      <BrandBuilder
        orgId={session.org.id}
        isOwner={session.org.memberRole === "owner"}
        company={{ name: b.org.name, website: b.org.website ?? "", hq_city: b.org.hq_city ?? "", hq_state: b.org.hq_state ?? "" }}
        profile={b.profile}
        products={b.products}
        files={b.files}
        refs={ref}
        initialStep={STEPS.find((s) => s === sp.step) ?? "company"}
      />
    </>
  );
}
