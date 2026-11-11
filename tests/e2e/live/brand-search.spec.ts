import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, signUpAndOnboard, skipUnlessLive } from "./helpers";

/**
 * Acceptance test 2: a brand signs up free, writes a brief, sees ranked
 * brokers with the expected fit scores on a fixture set, reveals a contact
 * (logged once) and saves/compares/requests a placement.
 */
test.describe("brand search, briefs and profiles (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => cleanup(m));

  test("fit ranking, contact reveal, save, compare, placement", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const A = await makeLiveBroker(m, {
      name: `E2E Lakeshore ${stamp}`, email: "a@lakeshore-e2e.example", verified: true,
      states: ["IL", "IN", "MI", "OH", "WI"], retailers: [["kroger", "weekly"], ["meijer", "monthly"], ["jewel-osco", "weekly"]],
      channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["unfi"],
    });
    const B = await makeLiveBroker(m, {
      name: `E2E Prairie ${stamp}`, email: "b@prairie-e2e.example",
      states: ["IL", "IA"], retailers: [["hy-vee", "weekly"], ["kroger", "occasional"]],
      channels: ["conventional-grocery"], categories: ["salty-snacks"], conflicts: ["meat-snacks"], distributors: ["kehe"],
    });

    // Signed out: cards are visible, contact details are not.
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(`/find?state=IL`);
    await expect(anonPage.locator(".bench-lcard_name", { hasText: `E2E Lakeshore ${stamp}` })).toBeVisible();
    await anonPage.goto(`/brokers/${A.slug}`);
    await expect(anonPage.getByRole("link", { name: "Create a free account" })).toBeVisible();
    await expect(anonPage.getByText("a@lakeshore-e2e.example")).toHaveCount(0);
    const axeAnon = await new AxeBuilder({ page: anonPage }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze();
    expect(axeAnon.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "axe on public profile").toEqual([]);
    await anonCtx.close();

    // Brand signs up free and writes a brief.
    const { orgId: brandOrg } = await signUpAndOnboard(page, m, "brand", `E2E Jerky Co ${stamp}`);
    await page.goto("/app/briefs");
    await page.fill("#new-title", "Midwest jerky launch");
    await page.getByRole("button", { name: "Create brief" }).click();
    await page.waitForURL(/\/app\/briefs\/[0-9a-f-]{36}$/);
    await page.selectOption("#b-cat", { label: "Meat Snacks" });
    for (const s of ["Illinois", "Ohio"]) await page.getByRole("group", { name: "States covered" }).getByRole("button", { name: new RegExp(s) }).click();
    for (const r of ["Kroger", "Meijer"]) { await page.getByLabel("Target retailers", { exact: true }).fill(r); await page.getByRole("button", { name: "Add", exact: true }).click(); }
    await page.getByRole("group", { name: "Channels" }).getByRole("button", { name: "Conventional Grocery" }).click();
    await expect(page.locator(".bench-save")).toHaveText("Saved", { timeout: 10_000 });

    // Expected scores from the spec formula:
    //  A: states 2/2 (35) + retailers (1+.7)/2 (30) + channels 1 (15) + category 1 (15) = 90.5/95 -> 95
    //  B: states 1/2 + retailers (.4+0)/2 + channels 1 + category 0 = 38.5/95 = 40.5, conflict -25 -> 16
    const top = page.locator("aside .bench-lcard");
    await expect(top.first().locator(".bench-lcard_name")).toHaveText(`E2E Lakeshore ${stamp}`, { timeout: 15_000 });
    await expect(top.nth(0).locator(".bench-lcard_fit b")).toHaveText("95");
    await expect(top.nth(1).locator(".bench-lcard_fit b")).toHaveText("16");
    await expect(top.nth(1)).toContainText("Lists Meat Snacks as a conflict");
    await expect(top.nth(0)).toContainText("Covers Kroger weekly, Meijer monthly");

    // /find ranks by the brief by default.
    await page.goto("/find");
    const cards = page.locator(".bench-results .bench-lcard");
    await expect(cards.first().locator(".bench-lcard_name")).toHaveText(`E2E Lakeshore ${stamp}`);
    await expect(cards.first().locator(".bench-lcard_fit b")).toHaveText("95");
    const axeFind = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze();
    expect(axeFind.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "axe on /find").toEqual([]);
    // Empty state names the filter to loosen.
    await page.goto("/find?state=CA&brief=none");
    await expect(page.getByText(/Remove the state filter to see/)).toBeVisible();

    // Profile: reveal contact (logged once per brand), save, placement request.
    await page.goto(`/brokers/${A.slug}`);
    await page.getByRole("button", { name: "Show contact details" }).click();
    await expect(page.getByText("a@lakeshore-e2e.example")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Show contact details" }).click();
    await expect(page.getByText("a@lakeshore-e2e.example")).toBeVisible();
    await page.getByRole("button", { name: `Save E2E Lakeshore ${stamp}` }).click();
    await expect(page.getByRole("button", { name: `Remove E2E Lakeshore ${stamp} from saved` })).toBeVisible();
    await page.getByRole("button", { name: "Have Purvey run this placement" }).click();
    await page.fill("#placement-note", "Kroger Central and Meijer by Q3.");
    await page.getByRole("button", { name: "Send to Purvey" }).click();
    await expect(page.getByText(/Request sent/)).toBeVisible();
    const axeProfile = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze();
    expect(axeProfile.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "axe on signed-in profile").toEqual([]);

    // Save B too, then compare side by side.
    await page.goto(`/brokers/${B.slug}`);
    await page.getByRole("button", { name: `Save E2E Prairie ${stamp}` }).click();
    await expect(page.getByRole("button", { name: `Remove E2E Prairie ${stamp} from saved` })).toBeVisible();
    await page.goto("/app/saved");
    await page.locator("[id^=folder-]").first().fill("Midwest snacks");
    await expect(page.locator(".bench-save").first()).toHaveText("Saved", { timeout: 10_000 });
    for (const c of await page.getByRole("checkbox", { name: "Compare" }).all()) await c.check();
    await page.getByRole("button", { name: "Compare selected" }).click();
    await expect(page.getByRole("heading", { name: "Compare" })).toBeVisible();
    await expect(page.locator("table")).toContainText("Fit to “Midwest jerky launch”");

    // What the brokers' analytics received (counts only).
    const db = admin();
    const count = async (listing: string, type: string) => (await db.from("profile_events").select("*", { count: "exact", head: true }).eq("listing_id", listing).eq("type", type)).count;
    expect(await count(A.listingId, "contact_reveal")).toBe(1);
    expect(await count(A.listingId, "save")).toBe(1);
    expect(await count(A.listingId, "profile_view")).toBeGreaterThanOrEqual(2);
    expect(await count(A.listingId, "search_impression")).toBeGreaterThanOrEqual(1);
    const { data: pr } = await db.from("placement_requests").select("status, note").eq("brand_org_id", brandOrg);
    expect(pr).toEqual([{ status: "new", note: "Kroger Central and Meijer by Q3." }]);
  });
});
