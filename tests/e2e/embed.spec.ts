import { expect, test, type Page } from "@playwright/test";

/**
 * Embedded mode and framing policy. Parent pages are served by Playwright
 * at fake origins so the real CSP frame-ancestors check runs in Chromium.
 */
const APP_ORIGIN = "https://bench.purveycpg.com";

/** Serve the local app at its production origin (proxied, real headers). */
async function proxyApp(page: Page, baseURL: string) {
  await page.route(`${APP_ORIGIN}/**`, async (route) => {
    const url = route.request().url().replace(APP_ORIGIN, baseURL);
    const response = await route.fetch({ url });
    await route.fulfill({ response });
  });
}

async function parent(page: Page, origin: string, src: string) {
  await page.route(`${origin}/bench-test`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0"><iframe id="bench" src="${src}" style="width:100%;height:900px;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(`${origin}/bench-test`);
}

test("?embed=1 hides the site header, footer and CTA band but keeps the Bench nav", async ({ page }) => {
  await page.goto("/pricing?embed=1");
  await expect(page.locator("html")).toHaveAttribute("data-embed", "1");
  await expect(page.locator(".navbar")).toBeHidden();
  await expect(page.locator("section.footer")).toBeHidden();
  await expect(page.locator(".section_joinus")).toBeHidden();
  await expect(page.locator(".bench-subnav")).toBeVisible();
});

test("standalone shows the full site chrome", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator("html")).not.toHaveAttribute("data-embed", "1");
  await expect(page.locator(".navbar")).toBeVisible();
  await expect(page.locator("section.footer")).toBeVisible();
});

test("purveycpg.com may frame the app, and framing is detected without ?embed=1", async ({ page, baseURL }) => {
  await proxyApp(page, baseURL!);
  await parent(page, "https://www.purveycpg.com", `${APP_ORIGIN}/pricing`);
  const frame = page.frameLocator("#bench");
  await expect(frame.locator(".bench-subnav")).toBeVisible();
  await expect(frame.locator("html")).toHaveAttribute("data-embed", "1");
  await expect(frame.locator(".navbar")).toBeHidden();
});

test("any other site is refused by frame-ancestors", async ({ page, baseURL }) => {
  await proxyApp(page, baseURL!);
  const blocked = page.waitForEvent("console", (m) => /frame-ancestors/.test(m.text()));
  await parent(page, "https://evil.example", `${APP_ORIGIN}/pricing`);
  await blocked; // Chromium reports the CSP refusal
  const f = page.frames().find((fr) => fr !== page.mainFrame());
  const loaded = f ? await f.locator(".bench-subnav").count().catch(() => 0) : 0;
  expect(loaded).toBe(0);
});

test("Google sign-in opens at the top level, not inside the frame", async ({ page }) => {
  await page.goto("/sign-in?embed=1");
  await expect(page.locator('a[href^="/auth/google"]')).toHaveAttribute("target", "_top");
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'self' https://purveycpg.com https://www.purveycpg.com");
  expect(res.headers()["x-frame-options"]).toBeUndefined();
});

test("signed-out visitors are sent to sign-in from /app", async ({ page }) => {
  await page.goto("/app/team");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fteam/);
});
