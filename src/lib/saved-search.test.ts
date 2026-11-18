import { describe, expect, it } from "vitest";
import { describeSearch, newMatches, searchHref, toSavedFilters } from "./saved-search";
import type { ListingRow } from "./search";
import type { Reference } from "./reference";

const ref: Reference = {
  regions: [{ code: "midwest", name: "Midwest" }],
  states: [{ code: "OH", name: "Ohio", region_code: "midwest" }, { code: "TX", name: "Texas", region_code: "southwest" }],
  retailers: [{ id: 1, name: "Kroger" }], channels: [{ id: 2, name: "Grocery" }], distributors: [], categories: [{ id: 3, name: "Snacks" }],
};
const row = (over: Partial<ListingRow>): ListingRow => ({
  id: "l", orgId: "o", slug: "s", name: "N", logoUrl: null, hq: null, about: null, states: ["OH"],
  retailers: [{ retailerId: 1, name: "Kroger", freq: "weekly" }], channels: [2], distributors: [], categories: [3], conflicts: [],
  verified: false, notTakingNewLines: false, updatedAt: "2026-11-01T00:00:00Z", liveSince: "2026-11-10T00:00:00Z", ...over,
});

describe("saved searches", () => {
  it("keeps only the matching filters and drops junk, paging and sorting", () => {
    const f = toSavedFilters("?retailer=1&region=midwest&page=3&sort=recent&brief=none&state=zz&verified=1");
    expect(f).toEqual({ retailer: 1, region: "midwest", verified: "1" });
    expect(searchHref(f)).toBe("/find?region=midwest&retailer=1&verified=1");
    expect(searchHref({})).toBe("/find");
  });
  it("describes a search in plain words", () => {
    expect(describeSearch({ retailer: 1, region: "midwest", category: 3, taking: "1" }, ref)).toBe("Kroger · Midwest · Snacks · taking new lines");
    expect(describeSearch({}, ref)).toBe("All brokers");
  });
  it("finds only listings that match and went live since the last alert", () => {
    const all = [
      row({ id: "a", name: "New Ohio", liveSince: "2026-11-15T00:00:00Z" }),
      row({ id: "b", name: "Old Ohio", liveSince: "2026-11-01T00:00:00Z" }),
      row({ id: "c", name: "New Texas", states: ["TX"], liveSince: "2026-11-16T00:00:00Z" }),
      row({ id: "d", name: "Never live", liveSince: null }),
    ];
    expect(newMatches(all, { region: "midwest", retailer: 1 }, ref, "2026-11-10T00:00:00Z").map((l) => l.id)).toEqual(["a"]);
    expect(newMatches(all, {}, ref, "2026-11-10T00:00:00Z").map((l) => l.id)).toEqual(["c", "a"]);
  });
});
