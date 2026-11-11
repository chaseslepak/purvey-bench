import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export const LIVE_URL = process.env.LIVE_URL ?? "https://www.purveycpg.com";
export const OUT = path.join(process.cwd(), "tests/visual/__output__");
fs.mkdirSync(OUT, { recursive: true });

/**
 * Bring a page to its settled, fully revealed state: trigger Webflow's
 * scroll-in animations, then freeze them in their final state.
 */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}" });
  await page.evaluate(() => {
    // Only elements still hidden by a scroll-in animation; leave other
    // inline transforms (e.g. the hamburger lines) alone.
    document.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      if (el.style.opacity !== "" && Number(el.style.opacity) < 1) {
        el.style.opacity = "1";
        el.style.transform = "none";
      }
    });
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

export type DiffResult = {
  width: number; height: number; liveSize: [number, number]; benchSize: [number, number];
  /** Raw pixelmatch count (includes sub-pixel glyph jitter). */
  diffPixels: number;
  /** Pixels with no match within a 1px neighbourhood in the other image. */
  shiftedDiffPixels: number;
  ratio: number;
};

/**
 * Text placed at a different fractional page offset rasterises on a
 * different sub-pixel phase. A pixel only counts as different if no pixel
 * within 1px in the other image has (nearly) the same colour, both ways.
 */
function shiftTolerantDiff(a: PNG, b: PNG, width: number, height: number, maxDelta = 48): number {
  const close = (x: PNG, i: number, y: PNG, j: number) =>
    Math.abs(x.data[i] - y.data[j]) <= maxDelta && Math.abs(x.data[i + 1] - y.data[j + 1]) <= maxDelta && Math.abs(x.data[i + 2] - y.data[j + 2]) <= maxDelta;
  const hasNeighbour = (x: PNG, y: PNG, px: number, py: number) => {
    const i = (py * width + px) * 4;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (close(x, i, y, (ny * width + nx) * 4)) return true;
    }
    return false;
  };
  let count = 0;
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    if (!hasNeighbour(a, b, px, py) || !hasNeighbour(b, a, px, py)) count++;
  }
  return count;
}

/** Pixel-diff two PNGs. Writes live | bench | diff side by side for review. */
export function diffImages(name: string, live: Buffer, bench: Buffer): DiffResult {
  const a = PNG.sync.read(live);
  const b = PNG.sync.read(bench);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const crop = (img: PNG) => {
    const out = new PNG({ width, height });
    PNG.bitblt(img, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const ca = crop(a);
  const cb = crop(b);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(ca.data, cb.data, diff.data, width, height, { threshold: 0.1, includeAA: false });

  const sheet = new PNG({ width: width * 3 + 20, height });
  sheet.data.fill(255);
  PNG.bitblt(ca, sheet, 0, 0, width, height, 0, 0);
  PNG.bitblt(cb, sheet, 0, 0, width, height, width + 10, 0);
  PNG.bitblt(diff, sheet, 0, 0, width, height, width * 2 + 20, 0);
  fs.writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(sheet));

  const shiftedDiffPixels = shiftTolerantDiff(ca, cb, width, height);
  return { width, height, liveSize: [a.width, a.height], benchSize: [b.width, b.height], diffPixels, shiftedDiffPixels, ratio: shiftedDiffPixels / (width * height) };
}

/** Typography and button styles that must match the site exactly. */
export const STYLE_PROPS = [
  "font-family", "font-size", "line-height", "letter-spacing", "font-weight", "text-transform",
  "color", "background-color", "border-radius", "height", "padding-left", "padding-right",
] as const;

export async function computed(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el, props) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
  }, STYLE_PROPS as unknown as string[]);
}

/** Box of every element inside `root`, relative to it, as "tag.classes x,y wxh". */
export async function layoutBoxes(page: Page, root: string) {
  return page.locator(root).first().evaluate((r) => {
    const o = r.getBoundingClientRect();
    // Zero-area elements paint nothing (e.g. Webflow's empty animated footer_pipely).
    return [...r.querySelectorAll("*")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).map((e) => {
      const b = e.getBoundingClientRect();
      const cls = [...e.classList].filter((c) => c !== "w--current" && !c.startsWith("bench-")).join(".");
      // Bench uses <button> where Webflow uses a <div> + webflow.js (menu
      // button) so it works by keyboard. Same box, same classes.
      const tag = e.tagName.toLowerCase() === "button" ? "div" : e.tagName.toLowerCase();
      return { el: `${tag}.${cls}`, x: b.x - o.x, y: b.y - o.y, w: b.width, h: b.height };
    });
  });
}
