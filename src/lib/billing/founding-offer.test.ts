import { describe, expect, it } from "vitest";
import { FOUNDING, foundingLine, spotsLeftFrom } from "./founding-offer";

describe("Founding Broker offer", () => {
  it("counts spots from the coupon's own redemption counters", () => {
    expect(spotsLeftFrom({ max_redemptions: 10, times_redeemed: 3, valid: true })).toBe(7);
    expect(spotsLeftFrom({ max_redemptions: 10, times_redeemed: 12, valid: true })).toBe(0);
    expect(spotsLeftFrom({ max_redemptions: null, times_redeemed: 4, valid: true })).toBe(FOUNDING.spots - 4);
  });
  it("an invalid coupon has no spots, an unknown one is unknown", () => {
    expect(spotsLeftFrom({ max_redemptions: 10, times_redeemed: 0, valid: false })).toBe(0);
    expect(spotsLeftFrom(null)).toBeNull();
  });
  it("only shows copy while spots are open, and never prints the code", () => {
    expect(foundingLine(null)).toBeNull();
    expect(foundingLine(0)).toBeNull();
    const line = foundingLine(4)!;
    expect(line).toContain("4 of 10 spots left");
    expect(line).not.toContain(FOUNDING.code);
  });
});
