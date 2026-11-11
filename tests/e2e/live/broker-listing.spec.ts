import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { admin, anon, cleanup, deliverStripeEvent, made, pdf, signUpAndOnboard, skipUnlessLive, stripeTest, tinyPng } from "./helpers";

/**
 * Acceptance test 1 (Phase 2 part): a broker signs up, builds a listing,
 * pays through Stripe test mode first, then builds and publishes, and becomes visible to brands.
 * 
 */
test.describe("broker listing and billing (live)", () => {
  skipUnlessLive();
  const m = made();
  test.afterAll(async () => cleanup(m));

  test("build, pay, go live; cancel at period end stays live; cancelled pauses", async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const db = admin();
    const orgName = `E2E Lakeshore ${Date.now()}`;
    const { orgId } = await signUpAndOnboard(page, m, "broker", orgName);
    const status = async () => (await db.from("broker_listings").select("status, completeness").eq("org_id", orgId).single()).data!;
    const saved = async () => { await page.waitForTimeout(200); await page.locator(".bench-save.is-saved").waitFor({ timeout: 10_000 }); };
    const step = (name: string) => page.getByRole("navigation", { name: "Listing steps" }).getByRole("button", { name: new RegExp(name) }).click();

    // Pay first: the plan picker, then Stripe Checkout at the top level (captured, not followed).
    await page.goto("/app/listing");
    await expect(page.getByRole("heading", { name: /Choose your plan/ })).toBeVisible();
    let checkoutUrl = "";
    await page.route("https://checkout.stripe.com/**", (r) => { checkoutUrl = r.request().url(); return r.abort(); });
    await page.getByRole("button", { name: "Pay $300 for the year" }).click();
    await expect.poll(() => checkoutUrl, { timeout: 15_000 }).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    // Pay with Stripe's test card, as Checkout would, then Stripe's real event hits our webhook.
    const s = stripeTest();
    const customer = (await db.from("subscriptions").select("stripe_customer_id").eq("org_id", orgId).single()).data!.stripe_customer_id as string;
    m.customers.push(customer);
    const pm = await s.paymentMethods.attach("pm_card_visa", { customer });
    await s.customers.update(customer, { invoice_settings: { default_payment_method: pm.id } });
    const price = (await s.prices.list({ lookup_keys: ["bench_listing_annual"] })).data[0].id;
    const sub = await s.subscriptions.create({ customer, items: [{ price }], metadata: { org_id: orgId } });
    m.subs.push(sub.id);
    const created = await deliverStripeEvent(baseURL!, "customer.subscription.created", sub.id);
    expect(created.status).toBe(200);
    expect((await db.from("subscriptions").select("plan").eq("org_id", orgId).single()).data!.plan).toBe("annual");
    expect((await status()).status).toBe("draft"); // paid, not yet published

    await page.goto("/app/listing");
    await expect(page.locator(".bench-tag").first()).toHaveText("Draft");
    // 1. Company
    await page.fill("#website", "lakeshore-e2e.example");
    await page.fill("#hq-city", "Chicago");
    await page.selectOption("#hq-state", "IL");
    await page.fill("#about", "Midwest grocery brokerage calling on Kroger Central, Meijer and Jewel-Osco for emerging snack brands.");
    await page.fill("#c-name", "Xavier Lake");
    await page.fill("#c-title", "Principal");
    await page.fill("#c-email", "xavier@lakeshore-e2e.example");
    await page.fill("#c-phone", "312-555-0100");
    await saved();
    await page.setInputFiles("#logo", { name: "logo.png", mimeType: "image/png", buffer: tinyPng() });
    await expect(page.getByText("Logo updated.")).toBeVisible({ timeout: 15_000 });
    // 2. Coverage
    await step("Coverage");
    await page.getByRole("group", { name: "Region shortcuts" }).getByRole("button", { name: "Midwest" }).click();
    await page.getByRole("group", { name: "Channels" }).getByRole("button", { name: "Conventional Grocery" }).click();
    await page.getByRole("group", { name: "Distributors" }).getByRole("button", { name: "UNFI" }).click();
    await saved();
    await expect(page.locator(".bench-lcard p").first()).toContainText("Midwest");
    // 3. Retailers
    await step("Retailers");
    for (const [n, f] of [["Kroger", "weekly"], ["Meijer", "monthly"], ["Jewel-Osco", "weekly"], ["Rosauers", "occasional"]]) {
      await page.fill("#retailer-q", n);
      await page.selectOption("#retailer-freq", f);
      await page.getByRole("button", { name: "Add", exact: true }).click();
    }
    await saved();
    await expect(page.locator(".bench-lcard_retailers li").first()).toHaveText(/Jewel-OscoWeekly/);
    // 4. Categories
    await step("Categories");
    await page.getByRole("group", { name: "Categories you sell" }).getByRole("button", { name: "Meat Snacks" }).click();
    await page.getByRole("group", { name: "Conflicts" }).getByRole("button", { name: "Salty Snacks" }).click();
    await saved();
    // 5. Terms
    await step("Terms");
    await page.getByLabel("% of net sales").check();
    await page.fill("#rate-low", "3");
    await page.fill("#rate-high", "5");
    await page.fill("#min-term", "12");
    await saved();
    // 6. Proof
    await step("Proof");
    await page.fill("#years", "12");
    await page.fill("#team", "9");
    await page.fill("#merch", "4");
    await page.fill("#r0-name", "Ref One"); await page.fill("#r0-brand", "Brand One"); await page.fill("#r0-email", "r1@example.com");
    await page.fill("#r1-name", "Ref Two"); await page.fill("#r1-brand", "Brand Two"); await page.fill("#r1-email", "r2@example.com");
    await saved();
    const pdfInput = page.locator("input[type=file][accept='application/pdf']");
    await pdfInput.setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: pdf("/OpenAction << /S /JavaScript /JS (app.alert(1)) >>") });
    await expect(page.getByText(/contains scripts/)).toBeVisible({ timeout: 15_000 });
    await pdfInput.setInputFiles({ name: "Line card.pdf", mimeType: "application/pdf", buffer: pdf() });
    await expect(page.getByText("Line card.pdf added.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".bench-builder_side b.bench-h-section")).toHaveText("100%");
    expect((await status()).completeness).toBe(100);

    // Accessibility of every builder step while signed in.
    for (const s of ["Company", "Coverage", "Retailers", "Categories", "Terms", "Proof"]) {
      await step(s);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".section_joinus").analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `axe on ${s}`).toEqual([]);
    }

    // Publish: already paid, so it goes straight live.
    const started = Date.now();
    await page.getByRole("button", { name: "Publish listing" }).click();
    await expect.poll(async () => (await status()).status, { timeout: 15_000 }).toBe("live");
    expect(Date.now() - started).toBeLessThan(60_000); // "appears within a minute"
    const { data: visible } = await anon().from("broker_listings").select("id").eq("org_id", orgId);
    expect(visible).toHaveLength(1);
    // Acceptance 1: appears in /find (signed out) within a minute of paying.
    const anonCtx = await page.context().browser()!.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(`${baseURL}/find?state=IL`);
    await expect(anonPage.locator(".bench-lcard_name", { hasText: orgName })).toBeVisible();
    await anonCtx.close();
    expect(Date.now() - started).toBeLessThan(60_000);
    // Analytics page is reachable and accessible.
    await page.goto("/app/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    const axeA = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze();
    expect(axeA.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "axe on analytics").toEqual([]);

    // Idempotent and signature-checked.
    const dup = await fetch(`${baseURL}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": created.header, "content-type": "application/json" }, body: created.payload });
    expect((await dup.json()).duplicate).toBe(true);
    const bad = await fetch(`${baseURL}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef", "content-type": "application/json" }, body: created.payload });
    expect(bad.status).toBe(400);

    // Cancel at period end: stays live, billing page explains it, portal opens at the top level.
    await s.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await deliverStripeEvent(baseURL!, "customer.subscription.updated", sub.id);
    expect((await status()).status).toBe("live");
    await page.goto("/app/billing");
    await expect(page.getByText("cancels at period end")).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude(".section_joinus").analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    let portalUrl = "";
    await page.route("https://billing.stripe.com/**", (r) => { portalUrl = r.request().url(); return r.abort(); });
    await page.getByRole("button", { name: /Update card/ }).click();
    await expect.poll(() => portalUrl, { timeout: 15_000 }).toMatch(/^https:\/\/billing\.stripe\.com\//);

    // Cancelled: the listing pauses and leaves search; data is kept.
    await s.subscriptions.cancel(sub.id);
    await deliverStripeEvent(baseURL!, "customer.subscription.deleted", sub.id);
    expect((await status()).status).toBe("paused");
    expect((await anon().from("broker_listings").select("id").eq("org_id", orgId)).data).toHaveLength(0);
    expect((await status()).completeness).toBe(100);
  });
});
