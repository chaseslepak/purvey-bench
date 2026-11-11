import type { Metadata } from "next";
import { Toolbox, type ToolFile } from "./Toolbox";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { loadConversation } from "@/lib/inbox/conversation";
import { beforeAgreement, DEAL_NOTE } from "../deal-stage";

export const metadata: Metadata = { title: "Toolbox", robots: { index: false } };

export default async function ToolboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, db, c, amBrand, other, me } = await loadConversation(id);
  const { data: files } = await db.from("toolbox_files").select("id, org_id, folder, file_name, size_bytes, created_at").eq("conversation_id", c.id).order("created_at", { ascending: false });
  // Only this conversation's files' events, not every event the org can see.
  const fileIds = (files ?? []).map((f) => f.id);
  const { data: events } = fileIds.length
    ? await db.from("toolbox_file_events").select("file_id, created_at").in("file_id", fileIds).order("created_at", { ascending: false })
    : { data: [] as { file_id: string; created_at: string }[] };
  const lastOpen = new Map<string, string>();
  for (const e of events ?? []) if (!lastOpen.has(e.file_id)) lastOpen.set(e.file_id, e.created_at);
  const rows: ToolFile[] = (files ?? []).map((f) => {
    const mine = f.org_id === session.org!.id;
    const opened = lastOpen.get(f.id);
    return {
      id: f.id, name: f.file_name, folder: f.folder, mine, size: f.size_bytes, at: f.created_at,
      by: mine ? me?.name ?? "Your team" : other?.name ?? "Other side",
      activity: opened ? `Opened · ${new Date(opened).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null,
    };
  });
  return (
    <>
      <ConversationHeader id={c.id} title={other?.name ?? "Conversation"} href={amBrand && other ? `/brokers/${other.slug}` : null} isBrand={amBrand} active="toolbox" note={(await beforeAgreement(db, c.id, session.org!.id, amBrand)) ? DEAL_NOTE : null} />
      <Toolbox id={c.id} isBrand={amBrand} otherName={other?.name ?? "the other side"} files={rows} />
    </>
  );
}
