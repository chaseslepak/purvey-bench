import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, pdf, signIn, signUpAndOnboard, skipUnlessLive } from "./helpers";

const axeIds = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

/** Brand profile v2 end to end: setup steps, products, data room, broker view, profile-ranked search. */
test.describe("brand profile (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => {
    const db = admin();
    for (const org of m.orgIds) {
      const { data } = await db.storage.from("brand-files").list(org);
      if (data?.length) await db.storage.from("brand-files").remove(data.map((f) => `${org}/${f.name}`));
    }
    await cleanup(m);
  });

  test("a brand builds its profile and a broker it messaged sees it", async ({ page: brand, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const db = admin();
    const B = await makeLiveBroker(m, { name: `E2E Profile Broker ${stamp}`, email: "p@pb.example", states: ["IL", "WI"], retailers: [["kroger", "weekly"]], channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["kehe"] });
    const { orgId: brandOrg, userId: brandUser } = await signUpAndOnboard(brand, m, "brand", `E2E Profile Brand ${stamp}`);

    // Onboarding lands on the brand profile setup.
    await expect(brand).toHaveURL(/\/app\/brand\?welcome=1/);
    await expect(brand.getByText(/Tell brokers who you are/)).toBeVisible();
    expect(await axeIds(brand), "axe: company step").toEqual([]);

    // 1. Company
    await brand.fill("#bp-web", "e2ebrand.example");
    await brand.getByRole("button", { name: "Save company details" }).click();
    await expect(brand.getByText("Company details saved.")).toBeVisible();
    await brand.fill("#bp-about", "Small-batch beef jerky made in Chicago from grass-fed beef, sold in Midwest grocery.");
    await brand.getByLabel("Categories", { exact: true }).fill("Meat snacks");
    await brand.getByLabel("Categories", { exact: true }).press("Enter");
    await brand.selectOption("#bp-stage", "regional");
    await brand.selectOption("#bp-rev", "1m_5m");
    await brand.getByRole("button", { name: "Non-GMO" }).click();
    await expect(brand.locator(".bench-save")).toHaveText("Saved", { timeout: 10_000 });

    // 2. Products
    await brand.getByRole("button", { name: "Next" }).click();
    await brand.fill("#pr-name", "Original Beef Jerky");
    await brand.fill("#pr-size", "2.5 oz");
    await brand.fill("#pr-msrp", "7.99");
    await brand.fill("#pr-upc", "012345678905");
    await brand.getByRole("button", { name: "Save product" }).click();
    await expect(brand.getByText("Original Beef Jerky saved.")).toBeVisible();
    expect(await axeIds(brand), "axe: products step").toEqual([]);

    // 3. Where you sell today
    await brand.getByRole("button", { name: "Next" }).click();
    await brand.getByLabel("Current retailers", { exact: true }).fill("Meijer");
    await brand.getByLabel("Current retailers", { exact: true }).press("Enter");
    await expect(brand.getByRole("button", { name: "Remove Meijer" })).toBeVisible();

    // 4. Where you want to be
    await brand.getByRole("button", { name: "Next" }).click();
    await brand.getByLabel("Target retailers", { exact: true }).fill("Kroger");
    await brand.getByLabel("Target retailers", { exact: true }).press("Enter");
    await brand.getByRole("group", { name: "Target regions" }).getByRole("button", { name: "Midwest" }).click();
    await brand.selectOption("#bp-time", "3_months");
    await brand.selectOption("#bp-model", "pct_net_sales");
    await brand.fill("#bp-rate", "5");
    await expect(brand.locator(".bench-save")).toHaveText("Saved", { timeout: 10_000 });
    expect(await axeIds(brand), "axe: goals step").toEqual([]);

    // 5. Data room
    await brand.getByRole("button", { name: "Next" }).click();
    await brand.locator("input[type=file]").setInputFiles({ name: "Sell sheet.pdf", mimeType: "application/pdf", buffer: pdf() });
    await expect(brand.getByText("1 file added to Sell sheets.")).toBeVisible({ timeout: 20_000 });
    await brand.locator("input[type=file]").setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: pdf("/OpenAction << /JS (app.alert(1)) >>") });
    await expect(brand.getByText(/PDFs can.t contain scripts/)).toBeVisible({ timeout: 20_000 });
    await brand.reload();
    await expect(brand.locator(".bench-builder_side .bench-h-section")).toHaveText("100%");

    // Preview, and search ranked by the profile.
    await brand.goto("/app/brand/preview");
    await expect(brand.getByRole("cell", { name: /Original Beef Jerky/ })).toBeVisible();
    await expect(brand.getByRole("button", { name: "Sell sheet.pdf" })).toBeVisible();
    expect(await axeIds(brand), "axe: preview").toEqual([]);
    await brand.goto("/find");
    await expect(brand.getByText(/ranked for your brand profile/)).toBeVisible();
    await expect(brand.locator(".bench-result", { hasText: `E2E Profile Broker ${stamp}` })).toBeVisible();

    // The broker sees the profile inside the conversation the brand started.
    const { data: conv } = await db.from("conversations").insert({ brand_org_id: brandOrg, broker_org_id: B.orgId, started_by: brandUser }).select("id").single();
    await db.from("messages").insert({ conversation_id: conv!.id, sender_user_id: brandUser, sender_org_id: brandOrg, body: "Hi, we'd like to talk." });
    const bctx = await browser.newContext();
    const broker = await bctx.newPage();
    await signIn(broker, B.ownerEmail, `/app/inbox/${conv!.id}/brand`);
    await broker.waitForURL(/\/brand$/);
    await expect(broker.getByText(/Small-batch beef jerky/)).toBeVisible();
    await expect(broker.getByRole("cell", { name: /Original Beef Jerky/ })).toBeVisible();
    // The file opens as a download in a new tab; capture the signed link and fetch it.
    await broker.evaluate(() => { (window as unknown as { opened: string[] }).opened = []; window.open = ((u: string) => { (window as unknown as { opened: string[] }).opened.push(u); return null; }) as typeof window.open; });
    await broker.getByRole("button", { name: "Sell sheet.pdf" }).click();
    await expect.poll(() => broker.evaluate(() => (window as unknown as { opened: string[] }).opened.length)).toBe(1);
    const url = await broker.evaluate(() => (window as unknown as { opened: string[] }).opened[0]);
    expect(url).toContain("/storage/v1/object/sign/brand-files/");
    const res = await broker.request.get(url);
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await axeIds(broker), "axe: broker brand tab").toEqual([]);
    await bctx.close();
  });
});
