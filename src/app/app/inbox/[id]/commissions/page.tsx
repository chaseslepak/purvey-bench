import type { Metadata } from "next";
import { Commissions, type Period, type Terms } from "./Commissions";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { loadConversation } from "@/lib/inbox/conversation";

export const metadata: Metadata = { title: "Commissions", robots: { index: false } };

export default async function CommissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, c, amBrand, other, me } = await loadConversation(id);
  const [{ data: t }, { data: ps }] = await Promise.all([
    db.from("deal_terms").select("*").eq("conversation_id", c.id).maybeSingle(),
    db.from("commission_periods").select("*").eq("conversation_id", c.id).order("period", { ascending: false }),
  ]);
  // Live recalculation for every month (used while a month is being revised).
  const previews = await Promise.all((ps ?? []).map((p) => db.rpc("commission_totals", { p })));
  const periods: Period[] = (ps ?? []).map((p, i) => ({
    id: p.id, period: p.period, status: p.status, reportName: p.report_name, lines: p.lines, adjustments: p.adjustments,
    invoiceNo: p.invoice_no, invoiceDate: p.invoice_date, dueDate: p.due_date, totals: p.totals, preview: (previews[i].data ?? {}) as Record<string, number>,
    questioned: p.questioned_note, paid: p.paid_date ? { date: p.paid_date, method: p.paid_method, ref: p.paid_ref } : null,
  }));
  const terms: Terms = t ? { rate: Number(t.rate), retainer: Number(t.retainer), retainerFrom: t.retainer_from, retainerTo: t.retainer_to, dueDays: t.invoice_due_days, notes: t.notes } : null;
  return (
    <>
      <ConversationHeader id={c.id} title={other?.name ?? "Conversation"} href={amBrand && other ? `/brokers/${other.slug}` : null} active="commissions" />
      <Commissions id={c.id} isBrand={amBrand} otherName={other?.name ?? "the other side"} myName={me?.name ?? "Your team"} terms={terms} periods={periods} />
    </>
  );
}
