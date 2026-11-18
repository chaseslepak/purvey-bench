import { describe, expect, it } from "vitest";
import { responsivenessLabel, speedLabel } from "./responsiveness";

describe("responsiveness", () => {
  it("says nothing until a brokerage has a few threads", () => {
    expect(responsivenessLabel(null)).toBeNull();
    expect(responsivenessLabel({ received: 2, answered: 2, medianHours: 1 })).toBeNull();
  });
  it("rounds the answer rate and describes the median time", () => {
    expect(responsivenessLabel({ received: 3, answered: 2, medianHours: 20 })).toBe("Answers 67% of brands · usually within a day");
    expect(responsivenessLabel({ received: 4, answered: 0, medianHours: null })).toBe("Answers 0% of brands");
  });
  it("buckets speed", () => {
    expect(speedLabel(2)).toBe("usually within a few hours");
    expect(speedLabel(48)).toBe("usually within 3 days");
    expect(speedLabel(100)).toBe("usually within a week");
    expect(speedLabel(400)).toBe("usually in over a week");
  });
});
