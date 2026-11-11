import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, pdf, signIn, signUpAndOnboard, skipUnlessLive } from "./helpers";

const axeIds = async (page: import("@playwright/test").Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

const KEHE_CSV = `Retailer,Distributor,Qty,Ext Cost,Net Amount
Meijer,KeHE,800,4000.00,3600.00
Meijer,KeHE,200,1000.00,900.00
Festival Foods,KeHE,50,250.00,250.00
`;

/** The deal room end to end: progress board, toolbox, commission true-up. */
test.describe("deal room (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => cleanup(m));

  test("progress, toolbox and true-up between a brand and a broker", async ({ page: brand, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const B = await makeLiveBroker(m, { name: `E2E Lakeshore ${stamp}`, email: "a@l.example", states: ["IL"], retailers: [["meijer", "monthly"]], channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["kehe"] });
    const { orgId: brandOrg, userId: brandUser } = await signUpAndOnboard(brand, m, "brand", `E2E Jerky Co ${stamp}`);
    // Set up the thread directly (messaging itself is covered by messaging.spec).
    const db = admin();
    const { data: conv } = await db.from("conversations").insert({ brand_org_id: brandOrg, broker_org_id: B.orgId, started_by: brandUser }).select("id").single();
    await db.from("messages").insert({ conversation_id: conv!.id, sender_user_id: brandUser, sender_org_id: brandOrg, body: "Let's work together." });
    const base = `/app/inbox/${conv!.id}`;

    const bctx = await browser.newContext();
    const broker = await bctx.newPage();
    await signIn(broker, B.ownerEmail, `${base}/progress`);
    await broker.waitForURL(/progress/);

    // ---- Progress: broker builds the board and posts an update.
    for (const [name, stores] of [["Meijer", "260"], ["Festival Foods", "38"]]) {
      await broker.fill("#acct-name", name); await broker.fill("#acct-stores", stores);
      await broker.getByRole("button", { name: "Add", exact: true }).click();
      await expect(broker.locator(".bench-board_card", { hasText: name })).toBeVisible();
    }
    await broker.getByRole("button", { name: "Post an update" }).click();
    await broker.selectOption("#u-acct", { label: "Meijer" });
    await broker.selectOption("#u-stage", "authorized");
    await broker.fill("#u-note", "Meijer authorized 2 SKUs in 260 stores for the May reset.");
    await broker.fill("#u-next", "Complete KeHE item setup");
    await broker.getByRole("button", { name: /Post to/ }).click();
    await expect(broker.getByText("Update posted.")).toBeVisible();
    expect(await axeIds(broker), "axe: progress (broker)").toEqual([]);

    await brand.goto(`${base}/progress`);
    await expect(brand.locator(".bench-board_col", { hasText: "Authorized" }).locator(".bench-board_card")).toContainText("Meijer");
    await expect(brand.getByText("Meijer authorized 2 SKUs")).toBeVisible();
    await expect(brand.getByRole("button", { name: "Post an update" })).toHaveCount(0);
    await brand.getByRole("button", { name: "Thanks" }).click();
    await expect(brand.getByRole("button", { name: "Thanked" })).toBeVisible();
    expect(await axeIds(brand), "axe: progress (brand)").toEqual([]);
    await broker.reload();
    await expect(broker.getByText(/said thanks/)).toBeVisible();

    // ---- Toolbox: brand shares a sell sheet; broker opens it; brand sees it was opened.
    await brand.goto(`${base}/toolbox`);
    await brand.locator("input[type=file]").setInputFiles({ name: "Sell sheet v3.pdf", mimeType: "application/pdf", buffer: pdf() });
    await expect(brand.getByText(/1 file added to Sell sheets/)).toBeVisible({ timeout: 20_000 });
    await expect(brand.getByText("Not opened yet")).toBeVisible();
    await broker.goto(`${base}/toolbox`);
    const popup = broker.waitForEvent("popup");
    await broker.getByRole("button", { name: "Sell sheet v3.pdf" }).click();
    await (await popup).close();
    await expect(broker.getByRole("button", { name: /Delete Sell sheet/ })).toHaveCount(0); // can't delete the brand's file
    expect(await axeIds(broker), "axe: toolbox").toEqual([]);
    await brand.reload();
    await expect(brand.getByText(/^Opened ·/)).toBeVisible();

    // ---- Commissions: terms -> brand CSV -> broker adjusts + invoices -> question -> re-invoice -> paid.
    await broker.goto(`${base}/commissions`);
    await broker.fill("#t-rate", "5"); await broker.fill("#t-ret", "0");
    await broker.getByRole("button", { name: "Save terms" }).click();
    await expect(broker.getByText("Terms saved.")).toBeVisible();

    await brand.goto(`${base}/commissions`);
    await expect(brand.getByText("5% of net sales on covered accounts")).toBeVisible();
    await brand.fill("#tu-month", "2027-03");
    await brand.selectOption("#tu-dist", "KeHE");
    await brand.locator("input[type=file]").setInputFiles({ name: "KeHE March.csv", mimeType: "text/csv", buffer: Buffer.from(KEHE_CSV) });
    await expect(brand.getByText(/Read 3 rows into 2 accounts/)).toBeVisible({ timeout: 20_000 });
    await expect(brand.locator("table").first()).toContainText("Meijer");
    expect(await axeIds(brand), "axe: commissions (brand)").toEqual([]);

    await broker.reload();
    // Meijer (covered): net 4500 -> 5% = 225. Festival Foods also on the board -> covered: net 250 -> 12.50.
    await expect(broker.getByText("Amount due to")).toBeVisible();
    await broker.fill("#adj-label", "Credit for spoils chargeback"); await broker.fill("#adj-amount", "-20");
    await broker.getByRole("button", { name: "Add", exact: true }).click();
    await expect(broker.getByText("Adjustment · Credit for spoils chargeback")).toBeVisible();
    await broker.getByRole("button", { name: /Create and send invoice · \$217\.50/ }).click();
    await expect(broker.getByText(/Invoice .* sent\./)).toBeVisible();

    await brand.reload();
    await expect(brand.locator(".bench-invoice")).toContainText("Total due $217.50");
    await brand.fill("#q-note", "Festival Foods isn't in our agreement.");
    await brand.getByRole("button", { name: "Send question" }).click();
    await expect(brand.getByText("The broker will see your question.")).toBeVisible();

    await broker.reload();
    await expect(broker.getByText(/asked: “Festival Foods isn't in our agreement.”/)).toBeVisible();
    const festival = broker.locator("tr", { hasText: "Festival Foods" }).getByRole("checkbox");
    await festival.uncheck();
    await expect(festival).not.toBeChecked();
    await broker.getByRole("button", { name: /Create and send invoice · \$205\.00/ }).click();
    await expect(broker.getByText(/Invoice .* sent\./)).toBeVisible();
    expect(await axeIds(broker), "axe: commissions (broker)").toEqual([]);

    await brand.reload();
    await expect(brand.locator(".bench-invoice")).toContainText("Total due $205.00");
    await brand.fill("#pay-ref", "004471");
    await brand.getByRole("button", { name: "Mark as paid" }).click();
    await expect(brand.locator(".bench-paid")).toContainText("Paid outside Bench by ACH · ref 004471");
    await broker.reload();
    await expect(broker.locator(".bench-paid")).toBeVisible();

    // Emails for each step reached Resend.
    await expect.poll(async () => {
      const { data } = await db.from("email_outbox").select("kind, sent_at").contains("payload", { conversation_id: conv!.id });
      return [...new Set((data ?? []).filter((r) => r.sent_at).map((r) => r.kind))].sort();
    }, { timeout: 30_000 }).toEqual(expect.arrayContaining(["deal_update", "true_up_invoiced", "true_up_paid", "true_up_questioned", "true_up_report"]));
    // The original report is in the toolbox for the broker.
    const { data: rep } = await db.from("toolbox_files").select("folder, file_name").eq("conversation_id", conv!.id).eq("folder", "Reports");
    expect(rep).toEqual([{ folder: "Reports", file_name: "KeHE March.csv" }]);
    await bctx.close();
  });
});
