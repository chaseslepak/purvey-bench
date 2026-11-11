import { describe, expect, it } from "vitest";
import { brandChecklist, completeness, EMPTY_PROFILE, profileToFit } from "./brand-profile";

describe("brand profile", () => {
  it("scores an empty profile 0 and a full one 100", () => {
    expect(completeness(brandChecklist(EMPTY_PROFILE, { products: 0, files: 0, website: false }))).toBe(0);
    const full = { ...EMPTY_PROFILE, about: "Small-batch beef jerky made in Chicago with grass-fed beef.", categories: [1], stage: "regional", annual_revenue_band: "1m_5m",
      current_retailers: [2], target_retailers: [3], target_regions: ["mw"], timeline: "now", commission_pref: "pct_net_sales" };
    expect(completeness(brandChecklist(full, { products: 2, files: 1, website: true }))).toBe(100);
  });

  it("turns goals into a fit brief, expanding regions into states", () => {
    const fit = profileToFit({ ...EMPTY_PROFILE, target_regions: ["mw"], target_states: ["TX"], target_retailers: [5], categories: [9, 10] },
      [{ code: "IL", region_code: "mw" }, { code: "OH", region_code: "mw" }, { code: "TX", region_code: "sw" }]);
    expect(fit).toEqual({ states: ["TX", "IL", "OH"], retailers: [5], channels: [], categoryId: 9, distributors: [] });
    expect(profileToFit(EMPTY_PROFILE, [])).toBeNull();
  });
});
