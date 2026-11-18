import { describe, expect, it } from "vitest";
import { stateSlug } from "./state-slug";

describe("stateSlug", () => {
  it("makes URL slugs from state names", () => {
    expect(stateSlug({ name: "Ohio" })).toBe("ohio");
    expect(stateSlug({ name: "New York" })).toBe("new-york");
    expect(stateSlug({ name: "District of Columbia" })).toBe("district-of-columbia");
  });
});
