import { afterEach, describe, expect, it, vi } from "vitest";

describe("cookieDomainFor", () => {
  afterEach(() => vi.resetModules());
  async function load(domain: string | undefined) {
    vi.stubEnv("COOKIE_DOMAIN", domain ?? "");
    return (await import("./env")).cookieDomainFor;
  }
  it("applies the shared domain on purveycpg.com hosts", async () => {
    const f = await load(".purveycpg.com");
    expect(f("bench.purveycpg.com")).toBe(".purveycpg.com");
    expect(f("purveycpg.com")).toBe(".purveycpg.com");
  });
  it("omits it on previews, localhost and look-alikes", async () => {
    const f = await load(".purveycpg.com");
    expect(f("purvey-bench-git-x-chase-slepak.vercel.app")).toBeUndefined();
    expect(f("localhost:3000")).toBeUndefined();
    expect(f("purveycpg.com.evil.com")).toBeUndefined();
    expect(f("notpurveycpg.com")).toBeUndefined();
  });
  it("is unset without COOKIE_DOMAIN", async () => {
    const f = await load(undefined);
    expect(f("bench.purveycpg.com")).toBeUndefined();
  });
});
