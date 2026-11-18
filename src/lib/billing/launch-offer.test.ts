import { describe, expect, it } from "vitest";
import { TIERS, nextTierNote, offerLine, offerPrice, pickOffer, spotsLeftFrom, type TierState } from "./launch-offer";

const [founding, charter] = TIERS;
const st = (tier: (typeof TIERS)[number], left: number | null, promoId: string | null = `promo_${tier.key}`): TierState => ({ tier, left, promoId });

describe("launch offer ladder", () => {
  it("counts spots from the coupon's own counters", () => {
    expect(spotsLeftFrom({ max_redemptions: 10, times_redeemed: 3, valid: true }, 10)).toBe(7);
    expect(spotsLeftFrom({ max_redemptions: 10, times_redeemed: 12, valid: true }, 10)).toBe(0);
    expect(spotsLeftFrom({ max_redemptions: null, times_redeemed: 4, valid: true }, 25)).toBe(21);
    expect(spotsLeftFrom({ max_redemptions: 10, times_redeemed: 0, valid: false }, 10)).toBe(0);
    expect(spotsLeftFrom(null, 10)).toBeNull();
  });

  it("opens founding first, then charter, then list price", () => {
    expect(pickOffer([st(founding, 4), st(charter, 25)])?.tier.key).toBe("founding");
    expect(pickOffer([st(founding, 0), st(charter, 25)])?.tier.key).toBe("charter");
    expect(pickOffer([st(founding, 0), st(charter, 0)])).toBeNull();
  });

  it("never skips ahead when a tier can't be read", () => {
    expect(pickOffer([st(founding, null), st(charter, 25)])).toBeUndefined();
    expect(pickOffer([st(founding, 0), st(charter, null)])).toBeUndefined();
  });

  it("writes copy without ever printing a code", () => {
    const f = pickOffer([st(founding, 7), st(charter, 25)]);
    const line = offerLine(f)!;
    expect(line).toContain("first 12 months free");
    expect(line).toContain("7 of 10 spots left");
    expect(line).not.toContain(founding.code);
    expect(nextTierNote(f)).toContain("next 25 brokerages get 50% off");
    expect(offerPrice(f).cta).toBe("Start free for 12 months");

    const c = pickOffer([st(founding, 0), st(charter, 9)]);
    expect(offerLine(c)).toContain("$50 a month for your first 12 months (50% off)");
    expect(offerLine(c)).toContain("9 of 25 spots left");
    expect(offerPrice(c).price).toBe("$50");

    expect(offerLine(null)).toBeNull();
    expect(offerLine(undefined)).toBeNull();
    expect(offerPrice(null).cta).toBe("Start monthly at $100");
  });
});
