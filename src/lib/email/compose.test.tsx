import { beforeAll, describe, expect, it } from "vitest";
import { composeEmail } from "./compose";
import { verifyUnsubscribe } from "./links";

beforeAll(() => { process.env.EMAIL_LINK_SECRET = "test-secret"; });
const ctx = { appUrl: "https://bench.purveycpg.com", userId: "00000000-0000-4000-a000-000000000001" };

describe("composeEmail", () => {
  it("builds a new-conversation email with HTML, plain text and a signed one-click unsubscribe", async () => {
    const e = await composeEmail("new_conversation", { conversation_id: "c1", from_org: "Acme Snacks", excerpt: "Hi <b>there</b>", brief_title: "Midwest jerky" }, ctx);
    expect(e.subject).toBe("Acme Snacks wants to talk");
    expect(e.html).toContain("https://bench.purveycpg.com/app/inbox/c1");
    expect(e.html).toContain("Hi &lt;b&gt;there&lt;/b&gt;"); // message text is escaped, never HTML
    expect(e.text).toContain("Hi <b>there</b>");
    const link = e.headers["List-Unsubscribe"].slice(1, -1);
    const u = new URL(link);
    expect(verifyUnsubscribe(u.searchParams.get("u")!, u.searchParams.get("k")!, u.searchParams.get("s")!)).toBe(true);
    expect(verifyUnsubscribe(u.searchParams.get("u")!, "new_message", u.searchParams.get("s")!)).toBe(false);
  });
  it("billing emails have no unsubscribe", async () => {
    const e = await composeEmail("payment_failed", {}, ctx);
    expect(e.headers["List-Unsubscribe"]).toBeUndefined();
    expect(e.html).not.toContain("Unsubscribe");
  });
});
