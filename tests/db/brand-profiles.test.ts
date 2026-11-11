import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);
const be = (id: string) => JSON.stringify({ sub: id, role: "authenticated" });

describe("brand profile v2", () => {
  it("the brand team edits its profile, products and data room; validation holds", async () => {
    await as(user(U.amy), async (q) => {
      const [{ id: kroger }] = await q<{ id: number }>("select id from retailers where slug = 'kroger'");
      await q("update brand_profiles set about = 'Small-batch jerky', target_retailers = array[$1::int], target_states = array['IL','WI'], certifications = array['non_gmo','gluten_free'], storage = 'ambient', timeline = '3_months' where org_id = $2", [kroger, f.brandA]);
      await expect(q("update brand_profiles set certifications = array['magic'] where org_id = $1", [f.brandA])).rejects.toThrow(/check/);
      await expect(q("update brand_profiles set target_states = array['ZZ'] where org_id = $1", [f.brandA])).rejects.toThrow(/unknown state/);
      await q("insert into brand_products (org_id, name, size, msrp, upc) values ($1, 'Original Beef Jerky', '2.5 oz', 7.99, '012345678905')", [f.brandA]);
      await expect(q("insert into brand_products (org_id, name, upc) values ($1, 'Bad', 'abc')", [f.brandA])).rejects.toThrow(/check/);
      await q("insert into brand_files (org_id, folder, file_name, storage_path, mime_type, size_bytes, created_by) values ($1::uuid, 'Sell sheets', 'sheet.pdf', $1::text || '/x.pdf', 'application/pdf', 100, $2)", [f.brandA, U.amy]);
      // Another brand can't touch it.
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.bob)]);
      expect(await q("select * from brand_products where org_id = $1", [f.brandA])).toHaveLength(0);
      await expect(q("insert into brand_products (org_id, name) values ($1, 'Fake')", [f.brandA])).rejects.toThrow(/row-level security/);
    });
  });

  it("brokers see a brand's profile only once that brand has messaged them", async () => {
    await as(user(U.alice), async (q) => {
      await q("insert into brand_products (org_id, name) values ($1, 'Teriyaki')", [f.brandA]);
      // Broker X has a conversation with brand A (fixture); broker Y does not.
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.xavier)]);
      expect(await q("select org_id from brand_profiles where org_id = $1", [f.brandA])).toHaveLength(1);
      expect(await q("select name from brand_products where org_id = $1", [f.brandA])).toEqual([{ name: "Teriyaki" }]);
      await expect(q("update brand_profiles set about = 'hacked' where org_id = $1", [f.brandA])).resolves.toBeDefined();
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.alice)]);
      const [p] = await q<{ about: string | null }>("select about from brand_profiles where org_id = $1", [f.brandA]);
      expect(p.about).not.toBe("hacked"); // broker update matched no rows
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.yolanda)]);
      expect(await q("select * from brand_profiles where org_id = $1", [f.brandA])).toHaveLength(0);
      expect(await q("select * from brand_products where org_id = $1", [f.brandA])).toHaveLength(0);
    });
  });

  it("profile targets count toward the public demand list (3-brand minimum)", async () => {
    await as({ role: "postgres" }, async (q) => {
      const [{ id: meijer }] = await q<{ id: number }>("select id from retailers where slug = 'meijer'");
      const c = (await q<{ id: string }>("insert into organizations (type, name, slug) values ('brand', 'Brand C2', 'brand-c2') returning id"))[0].id;
      await q("insert into brand_profiles (org_id) values ($1) on conflict do nothing", [c]);
      for (const org of [f.brandA, f.brandB, c]) await q("update brand_profiles set target_retailers = array[$1::int] where org_id = $2", [meijer, org]);
      await q("set local role anon");
      const rows = await q<{ name: string; brands: string }>("select name, brands from public.public_demand() where name = 'Meijer'");
      expect(rows).toEqual([{ name: "Meijer", brands: "3" }]);
    });
  });
});
