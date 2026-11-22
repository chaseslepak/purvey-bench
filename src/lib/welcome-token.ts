import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * "Your account is ready" links. Purvey sets an account up, then emails the
 * owner a link that signs them in and verifies their email in one step.
 * The token is signed with EMAIL_LINK_SECRET and names a nonce that is also
 * stored on the user; sending a new link replaces the nonce, so only the
 * newest link works, and using it clears it.
 */
export const WELCOME_DAYS = 14;
export type WelcomeClaims = { u: string; n: string; e: number };

function secret(): string {
  const s = process.env.EMAIL_LINK_SECRET;
  if (!s) throw new Error("EMAIL_LINK_SECRET is not set");
  return s;
}
const sig = (body: string) => createHmac("sha256", secret()).update(`welcome:${body}`).digest("base64url");

export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

export function signWelcome(userId: string, nonce: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, n: nonce, e: now + WELCOME_DAYS * 864e5 } satisfies WelcomeClaims)).toString("base64url");
  return `${body}.${sig(body)}`;
}

/** The claims, or why the token can't be used. Pure apart from the secret. */
export function verifyWelcome(token: string, now = Date.now()): { ok: true; claims: WelcomeClaims } | { ok: false; reason: "invalid" | "expired" } {
  const [body, s] = token.split(".");
  if (!body || !s) return { ok: false, reason: "invalid" };
  const want = Buffer.from(sig(body)), got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  let c: WelcomeClaims;
  try { c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return { ok: false, reason: "invalid" }; }
  if (typeof c?.u !== "string" || typeof c?.n !== "string" || typeof c?.e !== "number") return { ok: false, reason: "invalid" };
  if (c.e < now) return { ok: false, reason: "expired" };
  return { ok: true, claims: c };
}
