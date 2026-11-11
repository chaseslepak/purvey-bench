import { render, toPlainText } from "@react-email/render";
import { EmailLayout } from "./Layout";
import { KIND_LABEL, UNSUBSCRIBABLE, type Kind } from "./kinds";
import { unsubscribeUrl } from "./links";

export type Composed = { subject: string; html: string; text: string; headers: Record<string, string> };
type P = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

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
      paragraphs = ["Start your $100 monthly subscription to go live, if you haven't already."]; cta = { label: "Open your listing", href: `${ctx.appUrl}/app/listing` };
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
      const items = ctx.items ?? [];
      subject = kind === "digest" ? `${items.length} new message${items.length === 1 ? "" : "s"} on Purvey Bench` : `Purvey Bench admin digest: ${items.length} item${items.length === 1 ? "" : "s"}`;
      heading = kind === "digest" ? "Your daily summary" : "Admin digest";
      paragraphs = items.slice(0, 20).map((i) => `${s(i.from_org ?? i.broker ?? i.brand ?? "")}: ${s(i.excerpt ?? i.note ?? i.reason ?? "")}`.trim());
      cta = { label: kind === "digest" ? "Open your inbox" : "Open admin", href: `${ctx.appUrl}${kind === "digest" ? "/app/inbox" : "/admin"}` };
      break;
    }
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
