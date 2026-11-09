import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, signIn, signUpAndOnboard, skipUnlessLive } from "./helpers";

const axeIds = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

/** The admin console end to end, as a Purvey admin, against the live project. */
test.describe("admin console (live)", () => {
  skipUnlessLive();
  const m = made();
  const listIds: number[] = [];
  test.afterAll(async () => {
    const db = admin();
    if (listIds.length) await db.from("categories").delete().in("id", listIds);
    await cleanup(m);
  });

  test("overview, listings, verification, reports, requests, lists, audit and export", async ({ page: brand, browser, baseURL }) => {
    test.setTimeout(300_000);
    const stamp = Date.now();
    const db = admin();
    const B = await makeLiveBroker(m, { name: `E2E Admin Broker ${stamp}`, email: "c@ab.example", states: ["WI"], retailers: [["meijer", "weekly"]], channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["kehe"] });
    await db.from("broker_references").insert([{ listing_id: B.listingId, name: "Ref One", brand: "Acme", email: "r1@example.com" }, { listing_id: B.listingId, name: "Ref Two", brand: "Bolt", email: "r2@example.com" }]);
    const { data: v } = await db.from("verifications").insert({ listing_id: B.listingId, requested_by: B.ownerId }).select("id").single();
    await db.from("verification_reviews").insert({ verification_id: v!.id });

    // A brand reports the conversation and asks for a commission audit.
    const { orgId: brandOrg, userId: brandUser } = await signUpAndOnboard(brand, m, "brand", `E2E Admin Brand ${stamp}`);
    const { data: conv } = await db.from("conversations").insert({ brand_org_id: brandOrg, broker_org_id: B.orgId, started_by: brandUser }).select("id").single();
    await db.from("messages").insert({ conversation_id: conv!.id, sender_user_id: brandUser, sender_org_id: brandOrg, body: "Hello from the brand." });
    await brand.goto(`/app/inbox/${conv!.id}/commissions`);
    await brand.getByRole("button", { name: "Have Purvey audit commissions" }).click();
    await brand.fill("#audit-note", "Check Q1 Meijer.");
    await brand.getByRole("button", { name: "Send request" }).click();
    await expect(brand.getByText(/Request sent/)).toBeVisible();
    await db.from("reports").insert({ reporter_user_id: brandUser, reporter_org_id: brandOrg, conversation_id: conv!.id, reason: "E2E: off-topic pitch" });

    // Non-admins get a 404 at /admin.
    expect((await brand.goto("/admin"))?.status()).toBe(404);

    // A Purvey admin.
    const email = `bench-e2e-admin-${stamp}@example.com`;
    const { data: u } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: "E2E Admin" } });
    m.userIds.push(u.user!.id);
    await db.from("users").update({ is_admin: true, name: "E2E Admin" }).eq("id", u.user!.id);
    const actx = await browser.newContext();
    const a = await actx.newPage();
    await signIn(a, email, "/admin");
    await a.waitForURL(/\/admin$/);
    await expect(a.getByRole("heading", { name: "Bench admin" })).toBeVisible();
    await expect(a.getByText("Live listings")).toBeVisible();
    expect(await axeIds(a), "axe: overview").toEqual([]);

    // Listings: comp is already on (fixture); pause with a reason, then unpause.
    await a.goto(`/admin/listings?q=${encodeURIComponent(`E2E Admin Broker ${stamp}`)}`);
    await a.getByRole("link", { name: `E2E Admin Broker ${stamp}` }).click();
    await expect(a.getByText(new RegExp(B.ownerEmail.replace(/[.+]/g, "\\$&")))).toBeVisible(); // team list
    await a.fill("#pr", "E2E pause");
    await a.getByRole("button", { name: "Pause listing" }).click();
    await expect(a.getByText("Listing paused.")).toBeVisible();
    expect((await db.from("broker_listings").select("admin_paused").eq("id", B.listingId).single()).data!.admin_paused).toBe(true);
    await a.getByRole("button", { name: "Unpause" }).click();
    await expect(a.getByText("Listing unpaused.")).toBeVisible();
    await a.fill("#e-about", "Edited by Purvey in E2E.");
    await a.getByRole("button", { name: "Save changes" }).click();
    await expect(a.getByText("Saved.")).toBeVisible();
    expect(await axeIds(a), "axe: listing").toEqual([]);

    // Verification: verify is blocked until the checklist is saved.
    await a.goto("/admin/verification");
    await a.getByRole("link", { name: `E2E Admin Broker ${stamp}` }).click();
    await expect(a.getByRole("button", { name: "Verify listing" })).toBeDisabled();
    await a.selectOption('select[id^="rs-"] >> nth=0', "confirmed");
    await a.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(a.getByText("Reference updated.")).toBeVisible();
    await a.getByLabel(/At least two references reached/).check();
    await a.getByLabel("Retailer relationships confirmed").check();
    await a.getByRole("button", { name: "Save checklist" }).click();
    await expect(a.getByText("Checklist saved.")).toBeVisible();
    expect(await axeIds(a), "axe: verification").toEqual([]);
    await a.getByRole("button", { name: "Verify listing" }).click();
    await expect(a.getByText("Verified. The broker was emailed.")).toBeVisible();
    expect((await db.from("broker_listings").select("verified_at").eq("id", B.listingId).single()).data!.verified_at).not.toBeNull();

    // Reports: read the thread (audited), then resolve with a warning.
    await a.goto("/admin/reports");
    await a.getByRole("link", { name: "A conversation" }).first().click();
    await a.getByRole("link", { name: "Read the conversation" }).click();
    await expect(a.getByText("Hello from the brand.")).toBeVisible();
    await a.getByLabel("Email a warning to their owners").check();
    await a.fill("#wm", "Please keep pitches relevant.");
    await a.getByRole("button", { name: "Resolve" }).click();
    await expect(a.getByText("Report resolved.")).toBeVisible();
    expect(await axeIds(a), "axe: reports").toEqual([]);

    // Requests: the commission audit shows in the pipeline; open records (audited) and move it.
    await a.goto("/admin/requests");
    const card = a.locator(".bench-board_card", { hasText: "Check Q1 Meijer." });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "Open commission records" }).click();
    await expect(a.getByRole("heading", { name: "Commission audit" })).toBeVisible();
    await a.goBack();
    await a.locator(".bench-board_card", { hasText: "Check Q1 Meijer." }).locator("select").selectOption("contacted");
    await a.locator(".bench-board_card", { hasText: "Check Q1 Meijer." }).getByRole("button", { name: "Move" }).click();
    await expect(a.getByText("Moved to contacted.")).toBeVisible();
    expect(await axeIds(a), "axe: requests").toEqual([]);

    // Lists: add two, rename one, merge.
    await a.goto("/admin/lists?list=categories");
    for (const n of [`E2E Cat A ${stamp}`, `E2E Cat B ${stamp}`]) {
      await a.fill("#add", n);
      await a.getByRole("button", { name: "Add", exact: true }).click();
      await expect(a.getByText(`Added ${n}.`)).toBeVisible();
    }
    const { data: cats } = await db.from("categories").select("id, name").like("name", `E2E Cat % ${stamp}`);
    listIds.push(...(cats ?? []).map((c) => c.id));
    const catA = cats!.find((c) => c.name.startsWith("E2E Cat A"))!, catB = cats!.find((c) => c.name.startsWith("E2E Cat B"))!;
    await a.fill(`#rn-${catA.id}`, `E2E Cat A2 ${stamp}`);
    await a.locator(`#rn-${catA.id}`).locator("xpath=..").getByRole("button", { name: "Rename" }).click();
    await expect(a.getByText(`Renamed to E2E Cat A2 ${stamp}.`)).toBeVisible();
    await a.selectOption(`#mg-${catA.id}`, String(catB.id));
    await a.locator(`#mg-${catA.id}`).locator("xpath=..").getByRole("button", { name: "Merge" }).click();
    await expect(a.getByText(/^Merged\./)).toBeVisible();
    const { data: merged } = await db.from("categories").select("active, merged_into").eq("id", catA.id).single();
    expect(merged).toEqual({ active: false, merged_into: catB.id });

    // Audit log has the trail; CSV export downloads.
    await a.goto("/admin/audit");
    for (const action of ["listing.pause", "verification.verified", "conversation.admin_read", "report.resolved", "true_up.admin_read", "reference.merge"]) {
      await expect(a.locator("code", { hasText: action }).first()).toBeVisible();
    }
    expect(await axeIds(a), "axe: audit").toEqual([]);
    const res = await a.request.get(`${baseURL}/admin/export?kind=listings`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(await res.text()).toContain(`E2E Admin Broker ${stamp}`);
    expect((await brand.request.get(`${baseURL}/admin/export?kind=listings`)).status()).toBe(404);
    await actx.close();
  });
});
