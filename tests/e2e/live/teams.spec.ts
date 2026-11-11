import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { admin, cleanup, made, makeLiveBroker, signIn, signUpAndOnboard, skipUnlessLive } from "./helpers";

const axeIds = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);

/** Teams on both sides, and the retailer lists on the sign-up page, against the live project. */
test.describe("teams and sign-up lists (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => cleanup(m));

  test("invite, accept, change roles, assign, filter and leave", async ({ page: owner, browser }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const db = admin();
    const B = await makeLiveBroker(m, { name: `E2E Team Broker ${stamp}`, email: "t@tb.example", states: ["MN"], retailers: [["hy-vee", "weekly"]], channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["unfi"] });
    const { orgId: brandOrg, userId: ownerId } = await signUpAndOnboard(owner, m, "brand", `E2E Team Brand ${stamp}`);

    // Invite a teammate from the Team page (the link is shown, and emailed in test mode).
    const mateEmail = `bench-e2e-mate-${stamp}@example.com`;
    await owner.goto("/app/team");
    await expect(owner.getByRole("link", { name: "Team", exact: true })).toBeVisible();
    await owner.fill("#invite-email", mateEmail);
    await owner.getByRole("button", { name: "Create invite" }).click();
    const linkBox = owner.getByLabel("Invite link");
    await expect(linkBox).toBeVisible();
    await expect(owner.getByText(/Invite emailed/)).toBeVisible();
    const inviteUrl = new URL(await linkBox.inputValue());
    expect(await axeIds(owner), "axe: team").toEqual([]);

    // The teammate signs in and accepts.
    const { data: u } = await db.auth.admin.createUser({ email: mateEmail, email_confirm: true, user_metadata: { name: "E2E Mate" } });
    m.userIds.push(u.user!.id);
    await db.from("users").update({ name: "E2E Mate" }).eq("id", u.user!.id);
    const mctx = await browser.newContext();
    const mate = await mctx.newPage();
    await signIn(mate, mateEmail, inviteUrl.pathname);
    await mate.getByRole("button", { name: "Accept invite" }).click();
    await mate.waitForURL(/\/app$/);

    // Owner makes them an owner, then back to member.
    await owner.goto("/app/team");
    await expect(owner.locator("tbody tr")).toHaveCount(2); // regression: the list used to come back empty
    const row = owner.locator("tr", { hasText: mateEmail });
    await row.getByRole("button", { name: "Make owner" }).click();
    await expect(owner.getByText("Made an owner.")).toBeVisible();
    await owner.locator("tr", { hasText: mateEmail }).getByRole("button", { name: "Make member" }).click();
    await expect(owner.getByText("Changed to member.")).toBeVisible();
    // The only owner can't be demoted or leave: no controls on their own row.
    await expect(owner.locator("tr", { hasText: "(you)" }).getByRole("button")).toHaveCount(0);

    // Assign a conversation to the teammate.
    const { data: conv } = await db.from("conversations").insert({ brand_org_id: brandOrg, broker_org_id: B.orgId, started_by: ownerId }).select("id").single();
    await db.from("messages").insert({ conversation_id: conv!.id, sender_user_id: ownerId, sender_org_id: brandOrg, body: "Team test." });
    await owner.goto(`/app/inbox/${conv!.id}`);
    await owner.selectOption("#side-assignee", { label: "E2E Mate" });
    await expect(owner.getByText("Assignment updated.")).toBeVisible();
    const { data: mail } = await db.from("email_outbox").select("kind").eq("to_user_id", u.user!.id).eq("kind", "conversation_assigned");
    expect(mail).toHaveLength(1);

    // The teammate filters to their conversations; the team page counts it.
    await mate.goto("/app/inbox");
    await mate.getByRole("link", { name: "Assigned to me" }).click();
    await expect(mate.locator(".bench-thread", { hasText: `E2E Team Broker ${stamp}` })).toBeVisible();
    await expect(mate.locator(".bench-thread .bench-tag", { hasText: "You" })).toBeVisible();
    expect(await axeIds(mate), "axe: inbox").toEqual([]);
    await owner.goto("/app/team");
    await expect(owner.locator("tr", { hasText: mateEmail }).getByRole("link", { name: "1 conversation" })).toBeVisible();

    // The teammate leaves; the conversation goes back to unassigned.
    await mate.goto("/app/team");
    mate.once("dialog", (d) => d.accept());
    await mate.getByRole("button", { name: "Leave team" }).click();
    await mate.waitForURL(/\/app\/onboarding/);
    const { data: side } = await db.from("conversation_sides").select("assignee_user_id").eq("conversation_id", conv!.id).eq("org_id", brandOrg).single();
    expect(side!.assignee_user_id).toBeNull();
    await mctx.close();
  });

  test("sign-up shows covered accounts to brands and wanted accounts to brokers", async ({ page }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const db = admin();
    await makeLiveBroker(m, { name: `E2E Cover Broker ${stamp}`, email: "c@cb.example", states: ["IA"], retailers: [["hy-vee", "weekly"]], channels: ["conventional-grocery"], categories: ["meat-snacks"], distributors: ["unfi"] });
    // Three brands with briefs targeting the same retailer = enough to show demand.
    const { data: hyvee } = await db.from("retailers").select("id").eq("slug", "hy-vee").single();
    for (let i = 0; i < 3; i++) {
      const { data: o } = await db.from("organizations").insert({ type: "brand", name: `E2E Demand Brand ${i} ${stamp}`, slug: `e2e-demand-${i}-${stamp}` }).select("id").single();
      m.orgIds.push(o!.id);
      await db.from("briefs").insert({ brand_org_id: o!.id, title: "E2E demand", target_retailers: [hyvee!.id] });
    }

    await page.goto("/sign-up?role=brand");
    const forBrands = page.locator(".bench-for-brands");
    await expect(forBrands.getByRole("heading", { name: "Our brokers call on" })).toBeVisible();
    await expect(forBrands.getByRole("link", { name: /Hy-Vee/ })).toBeVisible();
    await expect(page.locator(".bench-for-brokers")).toBeHidden();
    expect(await axeIds(page), "axe: sign-up (brand)").toEqual([]);

    await page.locator('input[name="role"][value="broker"]').check();
    const forBrokers = page.locator(".bench-for-brokers");
    await expect(forBrokers.getByRole("heading", { name: "Brands are seeking brokers for" })).toBeVisible();
    await expect(forBrokers.getByText(/Hy-Vee/)).toBeVisible();
    await expect(forBrokers.getByText(/\d+ brands/).first()).toBeVisible();
    await expect(forBrands).toBeHidden();
    expect(await axeIds(page), "axe: sign-up (broker)").toEqual([]);

    // A covered retailer links into search, filtered to it.
    await page.locator('input[name="role"][value="brand"]').check();
    await forBrands.getByRole("link", { name: /Hy-Vee/ }).click();
    await page.waitForURL(new RegExp(`/find\\?retailer=${hyvee!.id}`));
  });
});
