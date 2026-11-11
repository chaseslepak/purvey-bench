import { describe, expect, it } from "vitest";
import { BREAKOUT, embedOrigins, safePath } from "./embed";

describe("embed helpers", () => {
  it("only accepts same-site paths", () => {
    expect(safePath("/brokers/acme?x=1")).toBe("/brokers/acme?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/a b", "/\\evil", "", null]) expect(safePath(bad)).toBe("/");
  });
  it("sends sign-in and the workspace full-window", () => {
    for (const p of ["/app", "/app/inbox", "/sign-in?next=/app", "/admin", "/auth/confirm", "/invite/abc"]) expect(BREAKOUT.test(p)).toBe(true);
    for (const p of ["/", "/find?state=IL", "/brokers/acme", "/pricing", "/for-brokers", "/apple"]) expect(BREAKOUT.test(p)).toBe(false);
  });
  it("adds only well-formed https extra origins", () => {
    expect(embedOrigins("https://purvey.webflow.io, http://bad.com, https://x.com/path")).toEqual(["https://purveycpg.com", "https://www.purveycpg.com", "https://purvey.webflow.io"]);
  });
});
