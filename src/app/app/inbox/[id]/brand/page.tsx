import type { Metadata } from "next";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { BrandView } from "@/components/brand/BrandView";
import { loadBrand } from "@/lib/brand-data";
import { loadConversation } from "@/lib/inbox/conversation";
import { getReference } from "@/lib/reference";

export const metadata: Metadata = { title: "Brand profile", robots: { index: false } };

/** The brand's profile, products and data room, inside the conversation it started. */
export default async function ConversationBrand({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, c, amBrand, other } = await loadConversation(id);
  const [b, ref] = await Promise.all([loadBrand(db, c.brand_org_id), getReference()]);
  return (
    <>
      <ConversationHeader id={c.id} title={other?.name ?? "Conversation"} href={amBrand && other ? `/brokers/${other.slug}` : null} active="brand" />
      {amBrand && <p className="bench-notice bench-small" style={{ margin: 0 }}>This is your brand profile as {other?.name ?? "the broker"} sees it. <a className="bench-link" href="/app/brand">Edit it</a>.</p>}
      {b ? <BrandView b={b} refs={ref} /> : <p className="bench-muted">This brand hasn&rsquo;t set up its profile yet.</p>}
    </>
  );
}
