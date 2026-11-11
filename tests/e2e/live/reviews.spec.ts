import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, signIn, signUpAndOnboard, skipUnlessLive } from "./helpers";

const axeIds = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

/** Brand reviews and references, end to end against the live project. */
test.describe("reviews (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => cleanup(m));

  test("review, reference, broker reply and flag, Purvey moderation", async ({ page: brand, browser }) => {
    test.setTimeout(240_000);
    const stamp = Date.now();
    const db = admin();
    const name = `E2E Review Broker ${stamp}`;
    const B = await makeLiveBroker(m, { name, email: "r@rb.example", states: ["OH"], retailers: [["kroger", "weekly"]], channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["kehe"] });
    const { orgId: brandOrg, userId: brandUser } = await signUpAndOnboard(brand, m, "brand", `E2E Review Brand ${stamp}`);

    // A conversation the broker has replied to.
    const { data: conv } = await db.from("conversations").insert({ brand_org_id: brandOrg, broker_org_id: B.orgId, started_by: brandUser }).select("id").single();
    await db.from("messages").insert({ conversation_id: conv!.id, sender_user_id: brandUser, sender_org_id: brandOrg, body: "Can you cover Kroger?" });
    await db.from("messages").insert({ conversation_id: conv!.id, sender_user_id: B.ownerId, sender_org_id: B.orgId, body: "Yes, weekly." });

    // The thread invites the brand to review; the profile has the form.
    await brand.goto(`/app/inbox/${conv!.id}`);
    await brand.getByRole("link", { name: "Rate and review them" }).click();
    await brand.waitForURL(new RegExp(`/brokers/${B.slug}#reviews`));
    await expect(brand.getByText("No reviews yet.")).toBeVisible();
    await brand.locator(".bench-starinput_star").nth(3).click(); // the fourth star
    await expect(brand.getByRole("radio", { name: "4 stars, Very good" })).toBeChecked();
    await brand.fill("#rv-title", "Got us into Kroger fast");
    await brand.fill("#rv-body", "Weekly calls on the Kroger snacks buyer, clear updates every Friday.");
    await brand.getByLabel(/willing to be a reference/).check();
    await brand.fill("#rf-name", "Rita Reviewer");
    await brand.fill("#rf-email", "rita@brand.example");
    await brand.getByRole("button", { name: "Post review" }).click();
    await expect(brand.getByText("Thanks. Your review is live and Purvey has your reference.")).toBeVisible();
    const review = brand.locator(".bench-review", { hasText: "Got us into Kroger fast" });
    await expect(review).toContainText("Brand on Bench (your brand)");
    await expect(brand.locator(".bench-profile_head .bench-rating")).toContainText("4.0");
    expect(await axeIds(brand), "axe: profile with reviews").toEqual([]);

    // The search card shows the rating.
    await brand.goto(`/find?state=OH`);
    await expect(brand.locator(".bench-result", { hasText: name }).locator(".bench-rating")).toContainText("4.0");

    // A brand the broker never replied to can't review.
    const octx = await browser.newContext();
    const other = await octx.newPage();
    await signUpAndOnboard(other, m, "brand", `E2E Other Brand ${stamp}`);
    await other.goto(`/brokers/${B.slug}`);
    await expect(other.getByText(/You can review .* once they.ve replied/)).toBeVisible();
    await expect(other.locator("#rv-body")).toHaveCount(0);
    await octx.close();

    // The broker replies publicly and flags it.
    const bctx = await browser.newContext();
    const broker = await bctx.newPage();
    await signIn(broker, B.ownerEmail, "/app/reviews");
    await broker.waitForURL(/\/app\/reviews/);
    await broker.getByRole("button", { name: "Reply publicly" }).click();
    await broker.locator("textarea[id^='reply-']").fill("Thanks, great working with you.");
    await broker.getByRole("button", { name: "Save reply" }).click();
    await expect(broker.getByText("Reply posted.")).toBeVisible();
    await broker.getByRole("button", { name: "Flag for Purvey" }).click();
    await broker.locator("input[id^='flag-']").fill("E2E flag");
    await broker.getByRole("button", { name: "Send to Purvey" }).click();
    await expect(broker.getByText("Flagged. Purvey will take a look.")).toBeVisible();
    expect(await axeIds(broker), "axe: broker reviews").toEqual([]);
    await bctx.close();

    // Anyone sees the review and reply, but not which brand wrote it.
    const actx = await browser.newContext();
    const anon = await actx.newPage();
    await anon.goto(`/brokers/${B.slug}`);
    const pub = anon.locator(".bench-review", { hasText: "Got us into Kroger fast" });
    await expect(pub).toContainText("Brand on Bench");
    await expect(pub).toContainText("Thanks, great working with you.");
    await expect(pub).not.toContainText(`E2E Review Brand ${stamp}`);

    // Purvey sees the brand reference and the flag, and hides the review.
    const email = `bench-e2e-admin-${stamp}@example.com`;
    const { data: u } = await db.auth.admin.createUser({ email, email_confirm: true });
    m.userIds.push(u.user!.id);
    await db.from("users").update({ is_admin: true, name: "E2E Admin" }).eq("id", u.user!.id);
    const adm = await browser.newContext();
    const a = await adm.newPage();
    await signIn(a, email, `/admin/listings/${B.listingId}`);
    await a.waitForURL(/\/admin\/listings\//);
    await expect(a.getByText("Rita Reviewer", { exact: true })).toBeVisible();
    await a.goto("/admin/reviews");
    const flagged = a.locator(".bench-review", { hasText: "Got us into Kroger fast" });
    await expect(flagged).toContainText("E2E flag");
    await flagged.locator("input[name='reason']").fill("E2E moderation");
    await flagged.getByRole("button", { name: "Hide review" }).click();
    await expect(a.getByText("Review hidden.")).toBeVisible();
    expect(await axeIds(a), "axe: admin reviews").toEqual([]);
    await adm.close();

    await anon.reload();
    await expect(anon.getByText("No reviews yet.")).toBeVisible();
    await expect(anon.locator(".bench-profile_head .bench-rating")).toHaveCount(0);
    await actx.close();
  });
});
