import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);

describe("listing builder saves", () => {
  it("a broker replaces its own states and retailers atomically", async () => {
    await as(user(U.yolanda), async (q) => {
      await q("select public.save_listing_states($1, $2)", [f.listingY, ["WA", "OR"]]);
      await q("select public.save_listing_states($1, $2)", [f.listingY, ["OR", "ID"]]);
      const s = await q<{ state_code: string }>("select state_code from broker_states where listing_id = $1 order by 1", [f.listingY]);
      expect(s.map((r) => r.state_code)).toEqual(["ID", "OR"]);
      const [{ id }] = await q<{ id: number }>("select id from retailers where slug = 'kroger'");
      await q("select public.save_listing_retailers($1, $2)", [f.listingY, JSON.stringify([
        { retailer_id: id, call_frequency: "weekly" }, { custom_name: "Rosauers", call_frequency: "monthly" },
      ])]);
      const r = await q("select * from broker_retailers where listing_id = $1", [f.listingY]);
      expect(r).toHaveLength(2);
    });
  });

  it("another brokerage cannot overwrite them, nor can a brand", async () => {
    for (const who of [U.yolanda, U.alice]) {
      await expect(as(user(who), (q) => q("select public.save_listing_states($1, $2)", [f.listingX, ["AK"]]))).rejects.toThrow(/not your listing/);
      await expect(as(user(who), (q) => q("select public.save_listing_retailers($1, '[]')", [f.listingX]))).rejects.toThrow(/not your listing/);
      await expect(as(user(who), (q) => q("select public.save_listing_references($1, '[]')", [f.listingX]))).rejects.toThrow(/not your listing/);
    }
  });

  it("rejects unknown states", async () => {
    await expect(as(user(U.yolanda), (q) => q("select public.save_listing_states($1, $2)", [f.listingY, ["ZZ"]]))).rejects.toThrow(/unknown state/);
  });

  it("the checklist explains the score, and only to the brokerage", async () => {
    const items = await as(user(U.xavier), (q) => q<{ key: string; done: boolean; step: number }>("select * from public.my_listing_checklist()"));
    expect(items).toHaveLength(17);
    const [{ completeness }] = await as(user(U.xavier), (q) => q<{ completeness: number }>("select completeness from broker_listings where id = $1", [f.listingX]));
    expect(completeness).toBe(Math.round((100 * items.filter((i) => i.done).length) / items.length));
    expect(await as(user(U.alice), (q) => q("select * from public.my_listing_checklist()"))).toHaveLength(0);
  });
});
