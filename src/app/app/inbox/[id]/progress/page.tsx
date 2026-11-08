import type { Metadata } from "next";
import { Progress, type Account, type Update } from "./Progress";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { loadConversation } from "@/lib/inbox/conversation";
import { getReference } from "@/lib/reference";

export const metadata: Metadata = { title: "Progress", robots: { index: false } };

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, c, amBrand, other, me } = await loadConversation(id);
  const [accts, ups, thanks, ref] = await Promise.all([
    db.from("deal_accounts").select("id, custom_name, stage, stores, covered, retailers(name)").eq("conversation_id", c.id).order("created_at"),
    db.from("deal_updates").select("id, account_id, from_stage, to_stage, note, next_step, due_date, created_at").eq("conversation_id", c.id).order("created_at", { ascending: false }),
    db.from("deal_update_thanks").select("update_id"),
    getReference(),
  ]);
  const accounts: Account[] = (accts.data ?? []).map((a) => ({ id: a.id, name: a.custom_name ?? (a.retailers as unknown as { name: string } | null)?.name ?? "Account", stage: a.stage, stores: a.stores, covered: a.covered }));
  const thanked = new Set((thanks.data ?? []).map((t) => t.update_id as string));
  const brokerName = amBrand ? other?.name : me?.name;
  const updates: Update[] = (ups.data ?? []).map((u) => ({
    id: u.id, account: accounts.find((a) => a.id === u.account_id)?.name ?? "Account", from: u.from_stage, to: u.to_stage, note: u.note,
    next: u.next_step, due: u.due_date, at: u.created_at, author: brokerName ?? "Broker", thanked: thanked.has(u.id),
  }));
  return (
    <>
      <ConversationHeader id={c.id} title={other?.name ?? "Conversation"} href={amBrand && other ? `/brokers/${other.slug}` : null} active="progress" />
      <Progress id={c.id} isBroker={!amBrand} otherName={other?.name ?? "the other side"} accounts={accounts} updates={updates} retailers={ref.retailers} />
    </>
  );
}
