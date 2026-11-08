import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("allows app paths", () => {
    expect(safeNext("/app/inbox?x=1")).toBe("/app/inbox?x=1");
  });
  it("allows the Webflow embed page", () => {
    expect(safeNext("https://www.purveycpg.com/bench?path=/app")).toBe("https://www.purveycpg.com/bench?path=/app");
    expect(safeNext("https://purveycpg.com/bench")).toBe("https://purveycpg.com/bench");
  });
  it("rejects open redirects", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "https://purveycpg.com.evil.com/bench", "https://www.purveycpg.com/blog", "javascript:alert(1)"]) {
      expect(safeNext(bad)).toBe("/app");
    }
  });
});
