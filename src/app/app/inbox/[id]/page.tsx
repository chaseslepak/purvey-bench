import type { Metadata } from "next";
import Link from "next/link";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { notFound, redirect } from "next/navigation";
import { Thread, type Msg } from "./Thread";
import { BRAND_STAGES, BROKER_STAGES } from "@/lib/inbox/load";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await createClient();
  const { data: c } = await db
    .from("conversations")
    .select("id, brand_org_id, broker_org_id, brief_summary, declined_at, decline_reason, decline_note, brand:organizations!conversations_brand_org_id_fkey(name, slug), broker:organizations!conversations_broker_org_id_fkey(name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const amBrand = c.brand_org_id === session.org.id;
  if (!amBrand && c.broker_org_id !== session.org.id) notFound(); // e.g. an admin; they use the audited admin view

  const [msgs, side, notes, templates, members] = await Promise.all([
    db.from("messages").select("id, body, created_at, sender_org_id, sender_user_id, is_auto_reply, read_at, attachments").eq("conversation_id", id).order("created_at"),
    db.from("conversation_sides").select("brand_stage, broker_stage, archived, muted, assignee_user_id").eq("conversation_id", id).eq("org_id", session.org.id).single(),
    db.from("conversation_notes").select("id, body, created_at, author_user_id").eq("conversation_id", id).order("created_at"),
    db.from("message_templates").select("id, title, body").order("title"),
    db.from("org_members").select("user_id, users!org_members_user_id_fkey(name, email)").eq("org_id", session.org.id),
  ]);
  const teammates = (members.data ?? []).map((m) => {
    const u = m.users as unknown as { name: string | null; email: string } | null;
    return { id: m.user_id as string, name: u?.name || u?.email || "Teammate" };
  });
  const people = Object.fromEntries(teammates.map((t) => [t.id, t.name]));
  const other = (amBrand ? c.broker : c.brand) as unknown as { name: string; slug: string } | null;
  // Once the broker has replied, invite the brand to review them (only if it hasn't yet).
  let reviewPrompt = false;
  if (amBrand && other) {
    const brokerReplied = (msgs.data ?? []).some((m) => m.sender_org_id === c.broker_org_id && !m.is_auto_reply);
    if (brokerReplied) {
      const { data: l } = await db.from("broker_listings").select("id").eq("org_id", c.broker_org_id).maybeSingle();
      const { data: rv } = l ? await db.from("broker_reviews").select("id").eq("listing_id", l.id).eq("brand_org_id", session.org.id).maybeSingle() : { data: { id: "" } };
      reviewPrompt = !!l && !rv;
    }
  }

  return (
    <>
      <ConversationHeader id={c.id} title={other?.name ?? "Conversation"} href={amBrand && other ? `/brokers/${other.slug}` : null} active="" />
      {reviewPrompt && other && (
        <p className="bench-notice bench-small" style={{ margin: 0 }}>
          Worked with {other.name}? <Link className="bench-link" href={`/brokers/${other.slug}#reviews`}>Rate and review them</Link> to help other brands, or offer to be a reference.
        </p>
      )}
      <Thread
        conversationId={c.id}
        myOrgId={session.org.id}
        myOrgType={session.org.type}
        myUserId={session.userId}
        myName={session.name ?? "Teammate"}
        otherOrgId={amBrand ? c.broker_org_id : c.brand_org_id}
        otherName={other?.name ?? "Organization"}
        declined={c.declined_at ? { reason: c.decline_reason as string, note: c.decline_note } : null}
        briefSummary={(c.brief_summary as Record<string, unknown> | null) ?? null}
        messages={(msgs.data ?? []) as Msg[]}
        people={people}
        side={{ stage: (amBrand ? side.data?.brand_stage : side.data?.broker_stage) ?? null, archived: !!side.data?.archived, muted: !!side.data?.muted, assignee: side.data?.assignee_user_id ?? null }}
        stages={amBrand ? BRAND_STAGES : BROKER_STAGES}
        teammates={teammates}
        notes={(notes.data ?? []).map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: people[n.author_user_id as string] ?? "Teammate", mine: n.author_user_id === session.userId }))}
        templates={templates.data ?? []}
      />
    </>
  );
}
