/**
 * Every email the app sends. `unsubscribable: false` = sign-in and billing
 * (spec: every email has an unsubscribe for its type except those).
 */
export type Kind =
  | "new_conversation" | "new_message" | "broker_declined" | "placement_received"
  | "listing_submitted" | "listing_live" | "listing_paused" | "payment_failed"
  | "verification_verified" | "verification_rejected" | "verification_revoked"
  | "weekly_summary" | "digest"
  | "deal_update" | "true_up_report" | "true_up_invoiced" | "true_up_questioned" | "true_up_paid"
  | "admin_listing_submitted" | "admin_verification_requested" | "admin_placement_requested" | "admin_report_filed" | "admin_audit_requested" | "admin_digest" | "admin_warning" | "conversation_assigned" | "team_invite";

export const UNSUBSCRIBABLE: Record<Kind, boolean> = {
  new_conversation: true, new_message: true, broker_declined: true, placement_received: true,
  listing_submitted: true, listing_live: true, listing_paused: false, payment_failed: false,
  verification_verified: true, verification_rejected: true, verification_revoked: true,
  weekly_summary: true, digest: true,
  deal_update: true, true_up_report: true, true_up_invoiced: false, true_up_questioned: true, true_up_paid: true,
  admin_listing_submitted: true, admin_verification_requested: true, admin_placement_requested: true, admin_report_filed: true, admin_audit_requested: true, admin_digest: true, admin_warning: false,
  conversation_assigned: true, team_invite: false,
};

export const KIND_LABEL: Record<Kind, string> = {
  new_conversation: "new conversations", new_message: "new messages", broker_declined: "decline notices", placement_received: "placement receipts",
  listing_submitted: "listing submitted", listing_live: "listing live", listing_paused: "listing paused", payment_failed: "payment failed",
  verification_verified: "verification results", verification_rejected: "verification results", verification_revoked: "verification results",
  weekly_summary: "weekly summaries", digest: "daily digests",
  deal_update: "progress updates", true_up_report: "sales report notices", true_up_invoiced: "invoices", true_up_questioned: "invoice questions", true_up_paid: "payment notices",
  admin_listing_submitted: "admin: listings submitted", admin_verification_requested: "admin: verification requests",
  admin_placement_requested: "admin: placement requests", admin_report_filed: "admin: reports", admin_audit_requested: "admin: commission audit requests", admin_digest: "admin: daily digest", admin_warning: "account notices", conversation_assigned: "assignment notices", team_invite: "team invites",
};
