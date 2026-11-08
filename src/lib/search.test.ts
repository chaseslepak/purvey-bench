import { describe, expect, it } from "vitest";
import type { Reference } from "./reference";
import { parseFilters, search, type ListingRow } from "./search";

const ref: Reference = {
  regions: [{ code: "midwest", name: "Midwest" }, { code: "west", name: "West" }],
  states: [{ code: "IL", name: "Illinois", region_code: "midwest" }, { code: "OH", name: "Ohio", region_code: "midwest" }, { code: "CA", name: "California", region_code: "west" }],
  retailers: [{ id: 1, name: "Kroger" }, { id: 2, name: "Meijer" }], channels: [{ id: 10, name: "Conventional Grocery" }], distributors: [{ id: 50, name: "UNFI" }], categories: [{ id: 100, name: "Meat Snacks" }],
};
const row = (o: Partial<ListingRow>): ListingRow => ({
  id: o.name ?? "x", orgId: "o", slug: "s", name: "x", logoUrl: null, hq: null, about: null, states: [], retailers: [], channels: [], distributors: [], categories: [], conflicts: [],
  verified: false, notTakingNewLines: false, updatedAt: "2026-01-01", ...o,
});
const all = [
  row({ name: "Lakeshore", states: ["IL", "OH"], retailers: [{ retailerId: 1, name: "Kroger", freq: "weekly" }], channels: [10], categories: [100], verified: true, updatedAt: "2026-03-01" }),
  row({ name: "Pacific", states: ["CA"], retailers: [{ retailerId: 2, name: "Meijer", freq: "occasional" }], updatedAt: "2026-05-01" }),
  row({ name: "Buckeye", states: ["OH"], retailers: [{ retailerId: 1, name: "Kroger", freq: "monthly" }], notTakingNewLines: true, updatedAt: "2026-04-01" }),
];

describe("parseFilters", () => {
  it("keeps valid filters and drops junk", () => {
    expect(parseFilters({ state: "IL", channel: "10", verified: "1", page: "2", sort: "evil", brief: "nope", retailer: "x" })).toEqual({ state: "IL", channel: 10, verified: "1", page: 2 });
  });
});

describe("search", () => {
  it("filters by state, region, retailer, verified and taking new lines", () => {
    expect(search(all, { state: "OH" }, ref, null).items.map((i) => i.name)).toEqual(["Buckeye", "Lakeshore"]);
    expect(search(all, { region: "west" }, ref, null).items.map((i) => i.name)).toEqual(["Pacific"]);
    expect(search(all, { retailer: 1, taking: "1" }, ref, null).items.map((i) => i.name)).toEqual(["Lakeshore"]);
    expect(search(all, { verified: "1" }, ref, null).total).toBe(1);
  });
  it("defaults to most recently updated without a brief, and to best fit with one", () => {
    expect(search(all, {}, ref, null).items.map((i) => i.name)).toEqual(["Pacific", "Buckeye", "Lakeshore"]);
    const r = search(all, {}, ref, { states: ["OH"], retailers: [1], channels: [], categoryId: null, distributors: [] });
    expect(r.sort).toBe("fit");
    expect(r.items.map((i) => [i.name, i.fit?.score])).toEqual([["Lakeshore", 100], ["Buckeye", 86], ["Pacific", 0]]);
  });
  it("verified first is a viewer choice", () => {
    expect(search(all, { sort: "verified" }, ref, null).items[0].name).toBe("Lakeshore");
  });
  it("paginates 24 per page", () => {
    const many = Array.from({ length: 50 }, (_, i) => row({ name: `B${String(i).padStart(2, "0")}`, updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    const p3 = search(many, { page: 3 }, ref, null);
    expect([p3.pages, p3.page, p3.items.length]).toEqual([3, 3, 2]);
  });
  it("names the filter to loosen when nothing matches", () => {
    const r = search(all, { state: "CA", retailer: 1 }, ref, null);
    expect(r.total).toBe(0);
    expect(r.loosen).toEqual({ key: "state", count: 2 });
  });
});
