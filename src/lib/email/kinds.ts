/**
 * Every email the app sends. `unsubscribable: false` = sign-in and billing
 * (spec: every email has an unsubscribe for its type except those).
 */
export type Kind =
  | "new_conversation" | "new_message" | "broker_declined" | "placement_received"
  | "listing_submitted" | "listing_live" | "listing_paused" | "payment_failed"
  | "verification_verified" | "verification_rejected" | "verification_revoked"
  | "weekly_summary" | "digest"
  | "admin_listing_submitted" | "admin_verification_requested" | "admin_placement_requested" | "admin_report_filed" | "admin_digest";

export const UNSUBSCRIBABLE: Record<Kind, boolean> = {
  new_conversation: true, new_message: true, broker_declined: true, placement_received: true,
  listing_submitted: true, listing_live: true, listing_paused: false, payment_failed: false,
  verification_verified: true, verification_rejected: true, verification_revoked: true,
  weekly_summary: true, digest: true,
  admin_listing_submitted: true, admin_verification_requested: true, admin_placement_requested: true, admin_report_filed: true, admin_digest: true,
};

export const KIND_LABEL: Record<Kind, string> = {
  new_conversation: "new conversations", new_message: "new messages", broker_declined: "decline notices", placement_received: "placement receipts",
  listing_submitted: "listing submitted", listing_live: "listing live", listing_paused: "listing paused", payment_failed: "payment failed",
  verification_verified: "verification results", verification_rejected: "verification results", verification_revoked: "verification results",
  weekly_summary: "weekly summaries", digest: "daily digests",
  admin_listing_submitted: "admin: listings submitted", admin_verification_requested: "admin: verification requests",
  admin_placement_requested: "admin: placement requests", admin_report_filed: "admin: reports", admin_digest: "admin: daily digest",
};
