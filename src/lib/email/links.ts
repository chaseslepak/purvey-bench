import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed one-click unsubscribe links: /api/unsubscribe?u=<user>&k=<kind>&s=<sig>. */
function secret() {
  const s = process.env.EMAIL_LINK_SECRET;
  if (!s) throw new Error("EMAIL_LINK_SECRET is not set");
  return s;
}
export function signUnsubscribe(userId: string, kind: string): string {
  return createHmac("sha256", secret()).update(`${userId}:${kind}`).digest("base64url");
}
export function verifyUnsubscribe(userId: string, kind: string, sig: string): boolean {
  const want = Buffer.from(signUnsubscribe(userId, kind));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
export function unsubscribeUrl(appUrl: string, userId: string, kind: string): string {
  return `${appUrl}/api/unsubscribe?u=${userId}&k=${encodeURIComponent(kind)}&s=${signUnsubscribe(userId, kind)}`;
}
