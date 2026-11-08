import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Compose } from "./Compose";
import { env } from "@/lib/env";
import { loadListingBySlug } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New message", robots: { index: false } };

export default async function NewConversation({ searchParams }: { searchParams: Promise<{ broker?: string; brief?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "brand") redirect("/app/inbox");
  const { broker, brief } = await searchParams;
  if (!broker || !/^[a-z0-9-]{1,80}$/.test(broker)) notFound();
  const l = await loadListingBySlug(broker);
  if (!l) notFound();
  const db = await createClient();
  const [{ data: open }, { data: briefs }, { count }] = await Promise.all([
    db.from("conversations").select("id").eq("broker_org_id", l.orgId).is("declined_at", null).order("last_message_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("briefs").select("id, title").is("archived_at", null).order("updated_at", { ascending: false }),
    db.from("conversations").select("*", { count: "exact", head: true }).eq("brand_org_id", session.org.id),
  ]);
  if (open) redirect(`/app/inbox/${open.id}`);

  return (
    <section className="bench-section bench-stack" style={{ maxWidth: "48rem" }}>
      <div className="text_title"><Link className="bench-link" href={`/brokers/${l.slug}`}>{l.name}</Link></div>
      <h1 className="bench-h-section">Message {l.name}</h1>
      {l.notTakingNewLines && <p className="bench-notice" style={{ margin: 0 }}>{l.name} isn&rsquo;t taking on new lines right now. You can still reach out.</p>}
      <Compose brokerOrgId={l.orgId} brokerName={l.name} briefs={briefs ?? []} needsTurnstile={!count} turnstileSiteKey={env.turnstileSiteKey}
        defaultBrief={briefs?.find((b) => b.id === brief)?.id ?? briefs?.[0]?.id ?? null} />
    </section>
  );
}
