import fs from "node:fs";
import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { computed, diffImages, layoutBoxes, LIVE_URL, OUT, settle } from "./helpers";

/**
 * Acceptance check 9: the shared header, footer, CTA band, type and buttons
 * match purveycpg.com pixel for pixel (within font-rendering noise) at every
 * Webflow breakpoint. Live reference: /services, where no header link is
 * marked current.
 */
const WIDTHS = [1440, 1280, 991, 767, 479];
const MAX_RATIO = 0.005; // 0.5% of pixels may differ (anti-aliasing noise)
const LIVE_PAGE = `${LIVE_URL}/services`;
const BENCH_PAGE = "/pricing";

const REGIONS = [
  { name: "header", selector: ".navbar .padding-global.is-navbar" },
  // The closing band keeps the site's styles (checked below) but carries Bench copy, so it isn't pixel-compared.
  { name: "footer", selector: ".footer" },
];

async function open(browser: Browser, url: string, width: number) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });
  await settle(page);
  return page;
}

function record(entry: Record<string, unknown>) {
  fs.appendFileSync(path.join(OUT, "summary.jsonl"), JSON.stringify(entry) + "\n");
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    for (const region of REGIONS) {
      test(`${region.name} matches the live site`, async ({ browser, baseURL }) => {
        const live = await open(browser, LIVE_PAGE, width);
        const bench = await open(browser, `${baseURL}${BENCH_PAGE}`, width);
        // 1. Layout: every element inside the region has the same box (±0.5px).
        const [lb, bb] = await Promise.all([layoutBoxes(live, region.selector), layoutBoxes(bench, region.selector)]);
        expect(bb.map((e) => e.el), "same elements and classes").toEqual(lb.map((e) => e.el));
        lb.forEach((l, i) => {
          for (const k of ["x", "y", "w", "h"] as const) {
            expect(Math.abs(bb[i][k] - l[k]), `${l.el} ${k}`).toBeLessThanOrEqual(0.5);
          }
        });

        // 2. Pixels: identical within 1px sub-pixel text jitter.
        const a = await live.locator(region.selector).first().screenshot();
        const b = await bench.locator(region.selector).first().screenshot();
        const r = diffImages(`${region.name}-${width}`, a, b);
        record({ viewport: width, region: region.name, ...r });
        expect(Math.abs(r.liveSize[0] - r.benchSize[0]), "same width").toBeLessThanOrEqual(1);
        expect(Math.abs(r.liveSize[1] - r.benchSize[1]), "same height").toBeLessThanOrEqual(1);
        expect(r.ratio, `${r.shiftedDiffPixels} differing pixels (raw ${r.diffPixels})`).toBeLessThanOrEqual(MAX_RATIO);
        await live.close();
        await bench.close();
      });
    }

    test("type and buttons use the site's exact styles", async ({ browser, baseURL }) => {
      const live = await open(browser, LIVE_PAGE, width);
      const bench = await open(browser, `${baseURL}${BENCH_PAGE}`, width);
      for (const sel of [".section_joinus .heading-style-h2", ".section_joinus .button", ".navbar .button.is-small", ".footer_link", ".text_title"]) {
        const [l, b] = await Promise.all([computed(live, sel), computed(bench, sel)]);
        expect(b, sel).toEqual(l);
      }
      // Body text (height excluded: pages differ in length).
      const [lb, bb] = await Promise.all([computed(live, "body"), computed(bench, "body")]);
      for (const k of Object.keys(lb).filter((k) => k !== "height")) {
        expect(bb[k], `body ${k}`).toBe(lb[k]);
      }
      await live.close();
      await bench.close();
    });
  });
}
