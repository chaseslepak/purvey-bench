import { beforeAll, describe, expect, it } from "vitest";
import { newNonce, signWelcome, verifyWelcome, WELCOME_DAYS } from "./welcome-token";

beforeAll(() => { process.env.EMAIL_LINK_SECRET = "test-secret"; });
const U = "11111111-2222-4333-8444-555555555555";

describe("welcome links", () => {
  it("round-trips the user and nonce", () => {
    const n = newNonce();
    const r = verifyWelcome(signWelcome(U, n));
    expect(r).toMatchObject({ ok: true, claims: { u: U, n } });
  });
  it("expires after the window", () => {
    const t = signWelcome(U, "x", 0);
    expect(verifyWelcome(t, WELCOME_DAYS * 864e5 - 1).ok).toBe(true);
    expect(verifyWelcome(t, WELCOME_DAYS * 864e5 + 1)).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects tampering and junk", () => {
    const [body, s] = signWelcome(U, "x").split(".");
    const forged = Buffer.from(JSON.stringify({ u: "22222222-2222-4333-8444-555555555555", n: "x", e: Date.now() + 1e9 })).toString("base64url");
    expect(verifyWelcome(`${forged}.${s}`).ok).toBe(false);
    expect(verifyWelcome(`${body}.AAAA`).ok).toBe(false);
    expect(verifyWelcome("nope").ok).toBe(false);
    expect(verifyWelcome("").ok).toBe(false);
  });
});
