import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);
const claims = (id: string) => JSON.stringify({ sub: id, role: "authenticated" });

describe("teams", () => {
  it("owners change roles, but a team always keeps an owner", async () => {
    await as(user(U.alice), async (q) => {
      await expect(q("select public.set_member_role($1, 'member')", [U.alice])).rejects.toThrow(/at least one owner/);
      await q("select public.set_member_role($1, 'owner')", [U.amy]);
      await q("select public.set_member_role($1, 'member')", [U.alice]); // Amy is now the owner
      const rows = await q<{ user_id: string; role: string }>("select user_id, role from org_members where org_id = $1 order by role", [f.brandA]);
      expect(rows).toEqual([{ user_id: U.amy, role: "owner" }, { user_id: U.alice, role: "member" }]);
    });
    await expect(as(user(U.amy), (q) => q("select public.set_member_role($1, 'owner')", [U.amy]))).rejects.toThrow(/only owners/);
  });

  it("the last owner can't leave; a member can, and their assignments are cleared", async () => {
    await as(user(U.alice), async (q) => {
      await expect(q("select public.remove_member($1)", [U.alice])).rejects.toThrow(/at least one owner/);
      await q("update conversation_sides set assignee_user_id = $1 where conversation_id = $2 and org_id = $3", [U.amy, f.convAX, f.brandA]);
      await q("select set_config('request.jwt.claims', $1, true)", [claims(U.amy)]);
      await q("select public.remove_member($1)", [U.amy]);
      await q("set local role postgres");
      expect(await q("select * from org_members where user_id = $1", [U.amy])).toHaveLength(0);
      const [s] = await q<{ assignee_user_id: string | null }>("select assignee_user_id from conversation_sides where conversation_id = $1 and org_id = $2", [f.convAX, f.brandA]);
      expect(s.assignee_user_id).toBeNull();
    });
  });

  it("assigning a conversation to a teammate emails them; assigning yourself doesn't", async () => {
    await as(user(U.alice), async (q) => {
      await q("update conversation_sides set assignee_user_id = $1 where conversation_id = $2 and org_id = $3", [U.alice, f.convAX, f.brandA]);
      await q("update conversation_sides set assignee_user_id = $1 where conversation_id = $2 and org_id = $3", [U.amy, f.convAX, f.brandA]);
      await q("set local role postgres");
      const rows = await q<{ to_user_id: string; payload: { other: string } }>("select to_user_id, payload from email_outbox where kind = 'conversation_assigned'");
      expect(rows).toHaveLength(1);
      expect(rows[0].to_user_id).toBe(U.amy);
      expect(rows[0].payload.other).toBeTruthy();
    });
  });
});

describe("sign-up landing lists", () => {
  it("coverage lists retailers and distributors of live brokers, to anyone", async () => {
    const rows = await as({ role: "anon" }, (q) => q<{ kind: string; name: string; brokers: string }>("select * from public.public_coverage()"));
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(["Kroger", "Meijer"]));
    expect(rows.every((r) => Number(r.brokers) >= 1)).toBe(true);
  });

  it("demand shows a retailer only once 3 different brands want it", async () => {
    await as({ role: "postgres" }, async (q) => {
      const [{ id: kroger }] = await q<{ id: number }>("select id from retailers where slug = 'kroger'");
      const brandC = (await q<{ id: string }>("insert into organizations (type, name, slug) values ('brand', 'Brand C', 'brand-c') returning id"))[0].id;
      await q("update briefs set target_retailers = array[$1::int] where id = $2", [kroger, f.briefA]);
      await q("insert into product_events (name, org_id, props) values ('search', $1, $2)", [f.brandB, JSON.stringify({ retailers: [kroger] })]);
      await q("insert into product_events (name, org_id, props) values ('search', $1, $2)", [f.brandB, JSON.stringify({ retailers: [kroger] })]);
      await q("set local role anon");
      expect(await q("select * from public.public_demand()")).toHaveLength(0); // only 2 brands
      await q("set local role postgres");
      await q("insert into product_events (name, org_id, props) values ('search', $1, $2)", [brandC, JSON.stringify({ retailers: [kroger] })]);
      await q("set local role anon");
      const rows = await q<{ kind: string; name: string; brands: string }>("select * from public.public_demand()");
      expect(rows).toEqual([{ kind: "retailer", id: kroger, name: "Kroger", brands: "3" }]);
    });
  });
});
