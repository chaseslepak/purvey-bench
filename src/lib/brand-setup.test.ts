import { describe, expect, it } from "vitest";
import { brandSetupSchema, resolveNames } from "./brand-setup";

describe("resolveNames", () => {
  const refs = [{ id: 1, name: "Kroger" }, { id: 2, name: "H-E-B" }, { id: 3, name: "Ace Hardware" }];
  it("matches ignoring case and punctuation, keeps the rest as other", () => {
    expect(resolveNames(["kroger", "HEB", "H E B", "Lidl", "Lidl"], refs)).toEqual({ ids: [1, 2], other: ["Lidl"] });
  });
});

describe("brandSetupSchema", () => {
  it("normalizes website, email and states", () => {
    const p = brandSetupSchema.parse({ brand: { name: "Fat of the Land", website: "eatfatoftheland.com", hq_state: "tx" }, contact: { name: "Donald", email: "D@X.COM" } });
    expect(p.brand.website).toBe("https://eatfatoftheland.com");
    expect(p.brand.hq_state).toBe("TX");
    expect(p.contact.email).toBe("d@x.com");
    expect(p.products).toEqual([]);
  });
});
