import { describe, expect, it } from "vitest";
import { coverageSummary, topRetailers } from "./coverage";

const regions = [{ code: "mw", name: "Midwest" }, { code: "se", name: "Southeast" }];
const states = [
  { code: "IL", region_code: "mw" }, { code: "IN", region_code: "mw" }, { code: "OH", region_code: "mw" },
  { code: "GA", region_code: "se" }, { code: "FL", region_code: "se" },
];

describe("coverageSummary", () => {
  it("names national, whole regions and leftovers", () => {
    expect(coverageSummary(["IL", "IN", "OH", "GA", "FL"], states, regions)).toBe("National");
    expect(coverageSummary(["IL", "IN", "OH"], states, regions)).toBe("Midwest");
    expect(coverageSummary(["IL", "IN", "OH", "GA"], states, regions)).toBe("Midwest + 1 more state");
    expect(coverageSummary(["IL", "GA"], states, regions)).toBe("GA, IL");
    expect(coverageSummary([], states, regions)).toBe("No states yet");
  });
});

describe("topRetailers", () => {
  it("orders by call frequency then name", () => {
    const r = topRetailers([
      { name: "Meijer", freq: "monthly" as const }, { name: "Kroger", freq: "weekly" as const },
      { name: "Aldi", freq: "occasional" as const }, { name: "Jewel-Osco", freq: "weekly" as const },
    ], 3);
    expect(r.map((x) => x.name)).toEqual(["Jewel-Osco", "Kroger", "Meijer"]);
  });
});
