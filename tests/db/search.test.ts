import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, closePool, loadFixture, superuser, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);

describe("search logging and suggestions", () => {
  it("logs only sanitized ids and state codes, from anon or brands", async () => {
    await as(superuser, async (q) => {
      await q("select set_config('request.jwt.claims', '{}', true)");
      await q("set local role anon");
      await q(`select public.log_search('{"retailers":["1","2","x; drop"],"states":["IL","zz"],"notes":"secret brief text"}')`);
      await q("set local role postgres");
      const [e] = await q<{ props: Record<string, unknown> }>("select props from product_events where name = 'search' order by id desc limit 1");
      expect(e.props).toEqual({ retailers: [1, 2], states: ["IL"] });
    });
  });

  it("a broker gets anonymous suggestions, never who searched", async () => {
    await as(user(U.alice), async (q) => {
      const [{ id }] = await q<{ id: number }>("select id from retailers where slug = 'hy-vee'");
      for (let i = 0; i < 3; i++) await q("select public.log_search($1)", [JSON.stringify({ retailers: [String(id)], states: ["WI"] })]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      const s = await q<{ kind: string; label: string; searches: string }>("select * from public.broker_suggestions()");
      expect(s.find((x) => x.label === "Hy-Vee")?.searches).toBe("3");
      expect(s.find((x) => x.label === "Wisconsin")?.kind).toBe("state");
      expect(Object.keys(s[0]).sort()).toEqual(["current", "kind", "label", "ref", "searches"]);
      // Brokers still cannot read the raw events.
      expect(await q("select * from product_events")).toHaveLength(0);
    });
  });

  it("saving a broker counts as a save in that broker's analytics", async () => {
    await as(user(U.bob), async (q) => {
      await q("insert into saved_brokers (brand_org_id, listing_id, created_by) values ($1, $2, $3)", [f.brandB, f.listingX, U.bob]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      const rows = await q<{ type: string; total: string }>("select * from public.listing_analytics(30)");
      expect(rows.some((r) => r.type === "save" && Number(r.total) >= 1)).toBe(true);
    });
  });

  it("anon cannot read suggestions", async () => {
    await expect(as(anon, (q) => q("select * from public.broker_suggestions()"))).rejects.toThrow(/permission denied/);
  });
});
