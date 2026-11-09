import "server-only";
import { createClient } from "@/lib/supabase/server";

export const BRAND_STAGES = [["contacted", "Contacted"], ["talking", "Talking"], ["agreement_sent", "Agreement sent"], ["signed", "Signed"], ["passed", "Passed"]] as const;
export const BROKER_STAGES = [["new", "New"], ["replied", "Replied"], ["in_discussion", "In discussion"], ["won", "Won"], ["lost", "Lost"], ["declined", "Declined"]] as const;
export const stageLabel = (s: string | null) => [...BRAND_STAGES, ...BROKER_STAGES].find(([k]) => k === s)?.[1] ?? "—";

export type ThreadSummary = {
  id: string; otherOrgId: string; otherName: string; lastBody: string; lastAt: string; lastFromMe: boolean;
  unread: boolean; stage: string | null; archived: boolean; muted: boolean; declined: boolean; assignee: string | null;
};

/** The caller's threads with their own side's state. RLS limits rows to their org's threads. */
export async function loadThreads(myOrgId: string, opts: { tab: "all" | "unread" | "archived"; stage?: string; q?: string; assignee?: string }): Promise<ThreadSummary[]> {
  const db = await createClient();
  const { data: convs } = await db
    .from("conversations")
    .select("id, brand_org_id, broker_org_id, declined_at, last_message_at, brand:organizations!conversations_brand_org_id_fkey(name), broker:organizations!conversations_broker_org_id_fkey(name), conversation_sides(org_id, brand_stage, broker_stage, archived, muted, marked_unread, last_read_at, assignee_user_id)")
    .order("last_message_at", { ascending: false })
    .limit(500);
  const rows = (convs ?? []) as unknown as {
    id: string; brand_org_id: string; broker_org_id: string; declined_at: string | null; last_message_at: string;
    brand: { name: string } | null; broker: { name: string } | null;
    conversation_sides: { org_id: string; brand_stage: string | null; broker_stage: string | null; archived: boolean; muted: boolean; marked_unread: boolean; last_read_at: string | null; assignee_user_id: string | null }[];
  }[];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: msgs } = await db.from("messages").select("conversation_id, body, created_at, sender_org_id").in("conversation_id", ids).order("created_at", { ascending: false }).limit(2000);
  const last = new Map<string, { body: string; created_at: string; sender_org_id: string }>();
  const lastIncoming = new Map<string, string>();
  for (const m of msgs ?? []) {
    if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);
    if (m.sender_org_id !== myOrgId && !lastIncoming.has(m.conversation_id)) lastIncoming.set(m.conversation_id, m.created_at);
  }

  let matchIds: Set<string> | null = null;
  const q = opts.q?.trim();
  if (q) {
    const { data: hits } = await db.from("messages").select("conversation_id").ilike("body", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`).limit(500);
    matchIds = new Set((hits ?? []).map((h) => h.conversation_id as string));
  }

  return rows
    .map((r): ThreadSummary => {
      const side = r.conversation_sides.find((s) => s.org_id === myOrgId);
      const amBrand = r.brand_org_id === myOrgId;
      const lm = last.get(r.id);
      const incoming = lastIncoming.get(r.id);
      return {
        id: r.id,
        otherOrgId: amBrand ? r.broker_org_id : r.brand_org_id,
        otherName: (amBrand ? r.broker?.name : r.brand?.name) ?? "Organization",
        lastBody: lm?.body ?? "",
        lastAt: lm?.created_at ?? r.last_message_at,
        lastFromMe: lm?.sender_org_id === myOrgId,
        unread: Boolean(side?.marked_unread || (incoming && (!side?.last_read_at || incoming > side.last_read_at))),
        stage: (amBrand ? side?.brand_stage : side?.broker_stage) ?? null,
        archived: Boolean(side?.archived),
        muted: Boolean(side?.muted),
        declined: Boolean(r.declined_at),
        assignee: side?.assignee_user_id ?? null,
      };
    })
    .filter((t) => (opts.tab === "archived" ? t.archived : !t.archived))
    .filter((t) => (opts.tab === "unread" ? t.unread : true))
    .filter((t) => (opts.stage ? t.stage === opts.stage : true))
    .filter((t) => (opts.assignee ? (opts.assignee === "none" ? !t.assignee : t.assignee === opts.assignee) : true))
    .filter((t) => (q ? matchIds!.has(t.id) || t.otherName.toLowerCase().includes(q.toLowerCase()) : true));
}
