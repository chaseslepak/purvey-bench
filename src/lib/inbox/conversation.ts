import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** A conversation the caller's org is party to, or 404. Shared by the deal-room tabs. */
export async function loadConversation(id: string) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await createClient();
  const { data: c } = await db
    .from("conversations")
    .select("id, brand_org_id, broker_org_id, brief_summary, declined_at, decline_reason, decline_note, brand:organizations!conversations_brand_org_id_fkey(name, slug), broker:organizations!conversations_broker_org_id_fkey(name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const amBrand = c.brand_org_id === session.org.id;
  if (!amBrand && c.broker_org_id !== session.org.id) notFound();
  const other = (amBrand ? c.broker : c.brand) as unknown as { name: string; slug: string } | null;
  const me = (amBrand ? c.brand : c.broker) as unknown as { name: string; slug: string } | null;
  return { session, db, c, amBrand, other, me };
}
