import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, pdf, signIn, signUpAndOnboard, skipUnlessLive } from "./helpers";

/**
 * Acceptance tests 4 and 5: a brand opens a conversation (brief + file),
 * the broker replies, both inboxes update in real time, email notifications
 * are sent (Resend test mode), and a decline shows the brand a closed state.
 */
test.describe("messaging (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => cleanup(m));

  test("start, realtime reply, typing, read receipt, emails, decline", async ({ page: brand, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const B = await makeLiveBroker(m, {
      name: `E2E Lakeshore ${stamp}`, email: "a@lakeshore-e2e.example",
      states: ["IL", "OH"], retailers: [["kroger", "weekly"], ["meijer", "monthly"], ["jewel-osco", "weekly"]],
      channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["unfi"],
    });
    const brandName = `E2E Jerky Co ${stamp}`;
    await signUpAndOnboard(brand, m, "brand", brandName);
    // A brief to attach.
    await brand.goto("/app/briefs");
    await brand.fill("#new-title", "Midwest jerky launch");
    await brand.getByRole("button", { name: "Create brief" }).click();
    await brand.waitForURL(/\/app\/briefs\/[0-9a-f-]{36}$/);
    await brand.selectOption("#b-cat", { label: "Meat Snacks" });
    await expect(brand.locator(".bench-save")).toHaveText("Saved", { timeout: 10_000 });

    // Profile -> Message -> compose with brief and a PDF (Turnstile on the first message).
    await brand.goto(`/brokers/${B.slug}`);
    await brand.getByRole("link", { name: `Message E2E Lakeshore ${stamp}` }).click();
    await brand.waitForURL(/\/app\/inbox\/new/);
    await brand.fill("#compose-body", "Hi Lakeshore, we'd like Kroger Central and Meijer this year. Sell sheet attached.");
    await brand.selectOption("#compose-brief", { label: "Midwest jerky launch" });
    await brand.setInputFiles("#compose-files", { name: "Sell sheet.pdf", mimeType: "application/pdf", buffer: pdf() });
    await expect(brand.getByRole("button", { name: "Send message" })).toBeEnabled({ timeout: 15_000 }); // bot check passed
    await brand.getByRole("button", { name: "Send message" }).click();
    await brand.waitForURL(/\/app\/inbox\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const convId = brand.url().split("/").pop()!;
    await expect(brand.getByText("Shared 1 file")).toBeVisible();

    // Broker signs in (separate browser) and opens the thread.
    const bctx = await browser.newContext();
    const broker = await bctx.newPage();
    await signIn(broker, B.ownerEmail, "/app/inbox");
    await broker.waitForURL(/\/app\/inbox/);
    const row = broker.locator(".bench-thread", { hasText: brandName });
    await expect(row).toHaveClass(/is-unread/);
    await row.click();
    await broker.waitForURL(new RegExp(convId));
    await expect(broker.getByText("Brief attached by the brand · one-time summary")).toBeVisible();
    await expect(broker.getByText("Midwest jerky launch")).toBeVisible();
    await expect(broker.getByRole("button", { name: /PDF · Sell sheet\.pdf/ })).toBeVisible();
    const axe = await new AxeBuilder({ page: broker }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "axe on thread").toEqual([]);

    // Read receipt reaches the brand live; typing indicator; reply arrives live.
    await expect(brand.locator(".bench-msg.is-mine .bench-msg_meta").last()).toContainText("Read", { timeout: 15_000 });
    await broker.fill("#composer", "Happy to talk. We call on the Kroger Central snacks buyer weekly.");
    await broker.type("#composer", " ");
    await expect(brand.getByText(/is typing…/)).toBeVisible({ timeout: 10_000 });
    await broker.getByRole("button", { name: "Send", exact: true }).click();
    await expect(brand.getByText("We call on the Kroger Central snacks buyer weekly.")).toBeVisible({ timeout: 15_000 });

    // Each side keeps its own stage; the broker's moved to Replied automatically.
    await expect(broker.locator("#side-stage")).toHaveValue("replied", { timeout: 10_000 });
    await brand.selectOption("#side-stage", "talking");
    await expect(brand.getByText("Stage updated.")).toBeVisible();

    // Emails: new conversation (broker) and new message (brand) were sent via Resend.
    const db = admin();
    await expect.poll(async () => {
      const { data } = await db.from("email_outbox").select("kind, sent_at, last_error").in("kind", ["new_conversation", "new_message"]).contains("payload", { conversation_id: convId });
      return (data ?? []).filter((r) => r.sent_at && !r.last_error).map((r) => r.kind).sort();
    }, { timeout: 30_000 }).toEqual(expect.arrayContaining(["new_conversation", "new_message"]));

    // Decline: closed for the broker, polite closed state + email for the brand.
    await broker.getByRole("button", { name: "Decline" }).click();
    await broker.selectOption("#decline-reason", "not_taking_new_lines");
    await broker.fill("#decline-note", "We're at capacity until Q3.");
    await broker.getByRole("button", { name: "Decline conversation" }).click();
    await expect(broker.getByText("You declined this conversation.")).toBeVisible({ timeout: 10_000 });
    await brand.reload();
    await expect(brand.getByText(/has closed this conversation \(Not taking new lines\)/)).toBeVisible();
    await expect(brand.locator("#composer")).toHaveCount(0);
    await expect.poll(async () => {
      const { data } = await db.from("email_outbox").select("sent_at").eq("kind", "broker_declined").contains("payload", { conversation_id: convId });
      return (data ?? []).filter((r) => r.sent_at).length;
    }, { timeout: 30_000 }).toBeGreaterThan(0);
    await bctx.close();
  });
});
