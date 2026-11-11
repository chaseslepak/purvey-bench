import { render, toPlainText } from "@react-email/render";
import { EmailLayout } from "./Layout";
import { KIND_LABEL, UNSUBSCRIBABLE, type Kind } from "./kinds";
import { unsubscribeUrl } from "./links";

export type Composed = { subject: string; html: string; text: string; headers: Record<string, string> };
type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

const STAGE: Record<string, string> = { targeted: "Targeted", pitched: "Pitched", samples_sent: "Samples sent", category_review: "Category review", authorized: "Authorized", on_shelf: "On shelf" };
const DECLINE: Record<string, string> = { not_a_fit: "Not a fit", category_conflict: "Category conflict", not_taking_new_lines: "Not taking new lines", other: "Other" };

/** Turn an outbox row into a finished email (subject, HTML, plain text, List-Unsubscribe). */
export async function composeEmail(kind: Kind, payload: P, ctx: { appUrl: string; userId: string | null; items?: P[] }): Promise<Composed> {
  const thread = (id: unknown) => `${ctx.appUrl}/app/inbox/${s(id)}`;
  let subject: string, heading: string, paragraphs: string[], cta: { label: string; href: string } | undefined;
  switch (kind) {
    case "new_conversation":
      subject = `${s(payload.from_org)} wants to talk`;
      heading = `${s(payload.from_org)} sent you a message`;
      paragraphs = [`“${s(payload.excerpt)}”`, ...(payload.brief_title ? [`They attached a brief: ${s(payload.brief_title)}.`] : []), "Reply on Purvey Bench. Email replies aren't accepted."];
      cta = { label: "Open the conversation", href: thread(payload.conversation_id) };
      break;
    case "new_message":
      subject = `New message from ${s(payload.from_org)}`;
      heading = `${s(payload.from_org)} replied`;
      paragraphs = [`“${s(payload.excerpt)}”`];
      cta = { label: "Reply", href: thread(payload.conversation_id) };
      break;
    case "broker_declined":
      subject = `${s(payload.from_org)} closed your conversation`;
      heading = `${s(payload.from_org)} isn't taking this on`;
      paragraphs = [`Reason: ${DECLINE[s(payload.reason)] ?? "Other"}.`, ...(payload.note ? [`“${s(payload.note)}”`] : []), "Search for other brokers that fit your brief."];
      cta = { label: "Find brokers", href: `${ctx.appUrl}/find` };
      break;
    case "placement_received":
      subject = "Purvey received your placement request";
      heading = "We've got your placement request";
      paragraphs = [`Thanks. The Purvey team will be in touch within one business day about ${s(payload.broker)}.`];
      break;
    case "listing_submitted":
      subject = "Your listing is submitted"; heading = "Listing submitted";
      paragraphs = ["It isn't visible to brands yet. Open your listing and publish it to go live."]; cta = { label: "Open your listing", href: `${ctx.appUrl}/app/listing` };
      break;
    case "listing_live":
      subject = "Your Purvey Bench listing is live"; heading = "You're live";
      paragraphs = [`${s(payload.broker)} is now visible to brands searching Purvey Bench.`]; cta = { label: "See your listing", href: `${ctx.appUrl}/app/listing` };
      break;
    case "listing_paused":
      subject = "Your listing is paused"; heading = "Your listing is paused";
      paragraphs = [payload.by_admin ? "Purvey has paused your listing. Reply to this email to resolve it." : "Your subscription isn't active, so brands can't see your listing. Your data is saved; resubscribe or update your card to go live again."];
      cta = payload.by_admin ? undefined : { label: "Open billing", href: `${ctx.appUrl}/app/billing` };
      break;
    case "payment_failed":
      subject = "Your payment didn't go through"; heading = "Update your card";
      paragraphs = ["Your last payment for your Bench Listing failed. Your listing stays live for 7 days; update your card to keep it live."];
      cta = { label: "Update your card", href: `${ctx.appUrl}/app/billing` };
      break;
    case "verification_verified":
      subject = "You're verified on Purvey Bench"; heading = "Verified";
      paragraphs = ["Purvey checked your references and retailer relationships. Your profile now shows the Verified badge."];
      break;
    case "verification_rejected":
    case "verification_revoked":
      subject = kind === "verification_rejected" ? "About your verification request" : "Your verified badge was removed";
      heading = kind === "verification_rejected" ? "We couldn't verify your listing yet" : "Verification removed";
      paragraphs = [s(payload.reason) || "Reply to this email for details.", "You can request verification again once this is resolved."];
      cta = { label: "Open your listing", href: `${ctx.appUrl}/app/listing` };
      break;
    case "digest":
    case "admin_digest": {
      const items = ctx.items ?? (Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : []);
      subject = kind === "digest" ? `${items.length} new message${items.length === 1 ? "" : "s"} on Purvey Bench` : `Purvey Bench admin digest: ${items.length} item${items.length === 1 ? "" : "s"}`;
      heading = kind === "digest" ? "Your daily summary" : "Admin digest";
      paragraphs = items.slice(0, 20).map((i) => `${s(i.from_org ?? i.broker ?? i.brand ?? "")}: ${s(i.excerpt ?? i.note ?? i.reason ?? "")}`.trim());
      cta = { label: kind === "digest" ? "Open your inbox" : "Open admin", href: `${ctx.appUrl}${kind === "digest" ? "/app/inbox" : "/admin"}` };
      break;
    }
    case "deal_update":
      subject = `${s(payload.from_org)}: ${s(payload.account)} update`;
      heading = `${s(payload.account)} moved to ${STAGE[s(payload.to_stage)] ?? s(payload.to_stage)}`;
      paragraphs = [`“${s(payload.excerpt)}”`];
      cta = { label: "See progress", href: `${thread(payload.conversation_id)}/progress` };
      break;
    case "true_up_report":
      subject = `${s(payload.from_org)} uploaded ${s(payload.period)} sales`;
      heading = `${s(payload.period)} sales are in`;
      paragraphs = ["Review the accounts, add any adjustments and send your invoice. Payment happens outside Bench."];
      cta = { label: "Review and invoice", href: `${thread(payload.conversation_id)}/commissions` };
      break;
    case "true_up_invoiced":
      subject = `Invoice ${s(payload.invoice_no)} from ${s(payload.from_org)}`;
      heading = `Commission invoice for ${s(payload.period)}`;
      paragraphs = [`Total due: $${Number(payload.total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}.`, "Pay outside Bench (ACH or check), then mark it paid so both sides have the same record."];
      cta = { label: "View the invoice", href: `${thread(payload.conversation_id)}/commissions` };
      break;
    case "true_up_questioned":
      subject = `${s(payload.from_org)} has a question about invoice ${s(payload.invoice_no)}`;
      heading = "A question about your invoice";
      paragraphs = [`“${s(payload.note)}”`, "Revise the invoice or reply in Messages."];
      cta = { label: "Open commissions", href: `${thread(payload.conversation_id)}/commissions` };
      break;
    case "true_up_paid":
      subject = `${s(payload.from_org)} marked invoice ${s(payload.invoice_no)} paid`;
      heading = "Invoice marked paid";
      paragraphs = [`${s(payload.from_org)} recorded payment for ${s(payload.period)}. Check your bank for the deposit.`];
      cta = { label: "Open commissions", href: `${thread(payload.conversation_id)}/commissions` };
      break;
    case "conversation_assigned":
      subject = `${s(payload.by) || "A teammate"} assigned you the ${s(payload.other)} conversation`;
      heading = "A conversation is yours";
      paragraphs = [`${s(payload.by) || "A teammate"} assigned you the conversation with ${s(payload.other)} on Purvey Bench.`];
      cta = { label: "Open the conversation", href: thread(payload.conversation_id) };
      break;
    case "review_received":
      subject = `A brand left you a ${s(payload.rating)}-star review on Purvey Bench`;
      heading = "You have a new review";
      paragraphs = [payload.title ? `“${s(payload.title)}”` : "A brand you worked with on Bench reviewed you.", "You can reply publicly, or flag it for Purvey if something's wrong."];
      cta = { label: "See your reviews", href: `${ctx.appUrl}/app/reviews` };
      break;
    case "team_invite":
      subject = `${s(payload.inviter) || "A teammate"} invited you to ${s(payload.org)} on Purvey Bench`;
      heading = `Join ${s(payload.org)} on Purvey Bench`;
      paragraphs = [`${s(payload.inviter) || "A teammate"} invited you to join ${s(payload.org)} as ${s(payload.role) === "owner" ? "an owner" : "a member"}. The link works for 14 days and only for this email address.`];
      cta = { label: "Accept the invite", href: s(payload.link) };
      break;
    case "admin_warning":
      subject = "A message from Purvey about your Bench account"; heading = "About your account";
      paragraphs = [s(payload.message), "Reply to this email if you have questions. Repeated reports can lead to your account being paused."];
      break;
    case "weekly_summary":
      subject = "Your week on Purvey Bench"; heading = "Your week";
      paragraphs = [`Shown in search ${s(payload.impressions)} times · ${s(payload.views)} profile views · ${s(payload.reveals)} contact reveals · ${s(payload.conversations)} new conversations.`];
      cta = { label: "See analytics", href: `${ctx.appUrl}/app/analytics` };
      break;
    default: {
      // admin_* notifications
      const what: Record<string, string> = {
        admin_listing_submitted: `Listing submitted: ${s(payload.broker)}`,
        admin_verification_requested: `Verification requested: ${s(payload.broker)}`,
        admin_placement_requested: `Placement requested: ${s(payload.brand)} → ${s(payload.broker)}`,
        admin_report_filed: "A report was filed",
        admin_review_flagged: `Review flagged by ${s(payload.broker)}`,
        admin_reference_offered: `${s(payload.brand)} offered to be a reference for ${s(payload.broker)}`,
        admin_audit_requested: `Commission audit requested: ${s(payload.brand)} / ${s(payload.broker)}`,
      };
      subject = what[kind] ?? "Purvey Bench notification";
      heading = subject;
      paragraphs = [s(payload.note ?? payload.reason ?? "")].filter(Boolean);
      cta = { label: "Open admin", href: `${ctx.appUrl}/admin` };
    }
  }

  const unsub = UNSUBSCRIBABLE[kind] && ctx.userId ? unsubscribeUrl(ctx.appUrl, ctx.userId, kind) : null;
  const element = (
    <EmailLayout preview={subject} heading={heading} paragraphs={paragraphs} cta={cta}
      footerNote={kind === "new_conversation" || kind === "new_message" ? "You're getting this because a brand or broker messaged your team on Purvey Bench." : undefined}
      unsubscribe={unsub ? { href: unsub, label: `Unsubscribe from ${KIND_LABEL[kind]}` } : undefined} />
  );
  const html = await render(element);
  const text = toPlainText(html);
  const headers: Record<string, string> = unsub ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
  return { subject, html, text, headers };
}
