import { describe, expect, it } from "vitest";
import { fitScore, type FitBroker, type FitBrief } from "./fit";

const KROGER = 1, MEIJER = 2, JEWEL = 3, HYVEE = 4;
const broker: FitBroker = {
  states: ["IL", "IN", "MI", "OH"],
  retailers: [
    { retailerId: KROGER, name: "Kroger", freq: "weekly" },
    { retailerId: MEIJER, name: "Meijer", freq: "monthly" },
    { retailerId: JEWEL, name: "Jewel-Osco", freq: "occasional" },
  ],
  channels: [10, 11],
  categories: [100],
  conflicts: [200],
  distributors: [50],
};
const brief = (b: Partial<FitBrief>): FitBrief => ({ states: [], retailers: [], channels: [], categoryId: null, distributors: [], ...b });

describe("fitScore (fixture set from the spec)", () => {
  it("returns null when the brief sets nothing", () => {
    expect(fitScore(brief({}), broker)).toBeNull();
  });
  it("states only: share of brief states covered", () => {
    expect(fitScore(brief({ states: ["IL", "OH", "WI", "IA"] }), broker)!.score).toBe(50);
  });
  it("retailers use frequency weights: weekly 1, monthly .7, occasional .4, none 0", () => {
    // (1 + 0.7 + 0.4 + 0) / 4 = 0.525 -> 53
    expect(fitScore(brief({ retailers: [KROGER, MEIJER, JEWEL, HYVEE] }), broker)!.score).toBe(53);
  });
  it("weighted average over only the parts the brief sets", () => {
    // states 2/4 = .5 (w35), retailers (1 + .7)/2 = .85 (w30), channels 1/2 = .5 (w15), category 1 (w15), distributors 0/1 (w5)
    // = (17.5 + 25.5 + 7.5 + 15 + 0) / 100 = 65.5 -> 66
    const r = fitScore(brief({ states: ["IL", "WI"].concat(["OH", "IA"]), retailers: [KROGER, MEIJER], channels: [10, 12], categoryId: 100, distributors: [51] }), broker)!;
    expect(r.parts).toEqual({ states: 0.5, retailers: 0.85, channels: 0.5, category: 1, distributors: 0 });
    expect(r.score).toBe(66);
    // Only states + category: (35*.5 + 15*1) / 50 = 65
    expect(fitScore(brief({ states: ["IL", "WI"], categoryId: 100 }), broker)!.score).toBe(65);
  });
  it("a conflict subtracts 25 with a floor of 0 and flags the warning", () => {
    const r = fitScore(brief({ states: ["IL"], categoryId: 200 }), broker)!;
    // states 1 (w35), category 0 (w15) = 70 -> 45
    expect(r).toMatchObject({ score: 45, conflict: true });
    expect(fitScore(brief({ states: ["WI"], categoryId: 200 }), broker)!.score).toBe(0);
  });
  it("explains the match with retailers by frequency", () => {
    const r = fitScore(brief({ retailers: [MEIJER, KROGER], states: ["IL", "IN", "WI"] }), broker)!;
    expect(r.reasons).toEqual(["Covers Kroger weekly, Meijer monthly", "2 of your 3 states"]);
    expect(r.matchedRetailers.map((m) => m.name)).toEqual(["Kroger", "Meijer"]);
  });
  it("ignores duplicate ids in the brief", () => {
    expect(fitScore(brief({ states: ["IL", "IL", "WI"] }), broker)!.score).toBe(50);
  });
});
