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

// Background prefetches can still be in flight through the proxy when a test ends.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

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
  await expect(page.locator(".footer")).toBeHidden();
  await expect(page.locator(".section_joinus")).toBeHidden();
  await expect(page.locator(".bench-subnav")).toBeVisible();
});

test("standalone shows the full site chrome", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator("html")).not.toHaveAttribute("data-embed", "1");
  await expect(page.locator(".navbar")).toBeVisible();
  await expect(page.locator(".footer")).toBeVisible();
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

/** A Webflow-style /bench page that loads the real embed.js snippet. */
async function webflowBench(page: Page, query = "") {
  const origin = "https://www.purveycpg.com";
  await page.route(`${origin}/bench**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Bench | Purvey CPG</title></head><body style="margin:0"><header style="height:120px">Webflow header</header><div id="purvey-bench"></div><script src="${APP_ORIGIN}/embed.js" async></script><footer>Webflow footer</footer></body></html>`,
    }),
  );
  await page.goto(`${origin}/bench${query}`);
  return page.frameLocator("#purvey-bench iframe");
}

test.describe("embed.js snippet", () => {
  test("mounts the app, sizes the iframe to its content and follows navigation", async ({ page, baseURL }) => {
    await proxyApp(page, baseURL!);
    const frame = await webflowBench(page);
    await expect(frame.locator(".bench-subnav")).toBeVisible();
    await expect(frame.locator(".navbar")).toBeHidden();
    const iframe = page.locator("#purvey-bench iframe");
    await expect.poll(async () => (await iframe.boundingBox())?.height ?? 0).not.toBe(900); // resized from the default
    const h = (await iframe.boundingBox())!.height;
    const contentH = await frame.locator("html").evaluate((el) => Math.ceil(el.getBoundingClientRect().height));
    expect(Math.abs(h - Math.max(400, contentH))).toBeLessThan(4);
    await frame.locator(".bench-subnav").getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/bench\?path=%2Fpricing$/);
  });

  test("deep links open the right page; unsafe paths fall back to home", async ({ page, baseURL }) => {
    await proxyApp(page, baseURL!);
    const frame = await webflowBench(page, "?path=/for-brokers");
    await expect(frame.getByRole("heading", { level: 1 })).toContainText("Get found by brands");
    const frame2 = await webflowBench(page, "?path=//evil.example/x");
    await expect(frame2.locator(".bench-subnav")).toBeVisible();
    await expect(page.locator("#purvey-bench iframe")).toHaveAttribute("src", `${APP_ORIGIN}/?embed=1`);
  });

  test("sign-in opens full-window on bench.purveycpg.com", async ({ page, baseURL }) => {
    await proxyApp(page, baseURL!);
    const frame = await webflowBench(page);
    await frame.locator(".bench-subnav").getByRole("link", { name: "Sign in" }).click();
    await page.waitForURL(`${APP_ORIGIN}/sign-in`);
    await expect(page.locator(".navbar")).toBeVisible(); // full site chrome, not embedded
  });

  test("a deep link to the workspace goes straight to the app domain", async ({ page, baseURL }) => {
    await proxyApp(page, baseURL!);
    await webflowBench(page, "?path=/app/inbox").catch(() => {});
    await page.waitForURL(new RegExp(`^${APP_ORIGIN.replace(/\./g, "\\.")}/`));
  });
});
