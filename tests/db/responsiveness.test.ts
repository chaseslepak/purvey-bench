import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, closePool, loadFixture, superuser, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);

const claims = (sub: string) => JSON.stringify({ sub, role: "authenticated" });

describe("broker_responsiveness", () => {
  it("counts answered threads and the median time to a real reply; auto-replies and fresh threads don't count", async () => {
    await as(superuser, async (q) => {
      // Thread 1: Bob writes, Lakeshore replies. Backdated 3 days, so it took ~72 hours.
      await q("select set_config('request.jwt.claims', $1, true)", [claims(U.bob)]);
      const [{ id: c1 }] = await q<{ id: string }>("select public.start_conversation($1, 'Kroger Cincinnati?') as id", [f.brokerX]);
      await q("select set_config('request.jwt.claims', $1, true)", [claims(U.xavier)]);
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Yes, weekly.')", [c1, U.xavier, f.brokerX]);
      await q("update conversations set created_at = now() - interval '3 days' where id = $1", [c1]);

      // Thread 2: Amy writes and only the away-mode auto-reply answers. Backdated 4 days: received, not answered.
      await q("update broker_listings set away_message = 'Out until Monday.' where id = $1", [f.listingX]);
      await q("select set_config('request.jwt.claims', $1, true)", [claims(U.amy)]);
      const [{ id: c2 }] = await q<{ id: string }>("select public.start_conversation($1, 'Meijer?') as id", [f.brokerX]);
      await q("update conversations set created_at = now() - interval '4 days' where id = $1", [c2]);

      // The fixture thread (Alice, started today) is too new to count.
      const [r] = await q<{ received: number; answered: number; median_hours: string }>(
        "select received, answered, median_hours from public.broker_responsiveness(array[$1]::uuid[])", [f.brokerX]);
      expect(r.received).toBe(2);
      expect(r.answered).toBe(1);
      expect(Number(r.median_hours)).toBeGreaterThan(71);
      expect(Number(r.median_hours)).toBeLessThan(73);
    });
  });

  it("a decline answers the brand too", async () => {
    await as(superuser, async (q) => {
      await q("select set_config('request.jwt.claims', $1, true)", [claims(U.bob)]);
      const [{ id }] = await q<{ id: string }>("select public.start_conversation($1, 'Hello') as id", [f.brokerX]);
      await q("update conversations set created_at = now() - interval '5 days', declined_at = now() - interval '4 days', decline_reason = 'not_a_fit' where id = $1", [id]);
      const [r] = await q<{ received: number; answered: number; median_hours: string }>(
        "select received, answered, median_hours from public.broker_responsiveness(array[$1]::uuid[])", [f.brokerX]);
      expect([r.received, r.answered]).toEqual([1, 1]);
      expect(Number(r.median_hours)).toBeCloseTo(24, 0);
    });
  });

  it("anyone can read the aggregates, and nothing comes back for a brokerage with no threads", async () => {
    const rows = await as(anon, (q) => q("select * from public.broker_responsiveness(array[$1]::uuid[])", [f.brokerY]));
    expect(rows).toEqual([]);
  });
});

describe("saved_searches", () => {
  it("brand team members save, rename and delete their own; brokers and other brands can't see them", async () => {
    await as(user(U.alice), async (q) => {
      const [{ id }] = await q<{ id: string }>(
        "insert into saved_searches (brand_org_id, created_by, name, filters) values ($1, $2, 'Midwest Kroger', '{\"region\":\"midwest\"}') returning id", [f.brandA, U.alice]);
      await q("update saved_searches set name = 'Midwest grocery', alerts = false where id = $1", [id]);
      const rows = await q<{ name: string; alerts: boolean }>("select name, alerts from saved_searches");
      expect(rows).toEqual([{ name: "Midwest grocery", alerts: false }]);
      await expect(q("update saved_searches set last_alert_at = now() - interval '1 year' where id = $1", [id])).rejects.toThrow(/permission denied/);
    });
    await as(superuser, async (q) => {
      const asUser = async (sub: string) => { await q("reset role"); await q("select set_config('request.jwt.claims', $1, true)", [claims(sub)]); await q("set local role authenticated"); };
      await asUser(U.alice);
      await q("insert into saved_searches (brand_org_id, created_by, name) values ($1, $2, 'Shared')", [f.brandA, U.alice]);
      await asUser(U.amy);
      expect(await q("select name from saved_searches")).toEqual([{ name: "Shared" }]);
      await asUser(U.bob);
      expect(await q("select name from saved_searches")).toEqual([]);
      await expect(q("insert into saved_searches (brand_org_id, created_by, name) values ($1, $2, 'x')", [f.brandA, U.bob])).rejects.toThrow(/row-level security/);
      await asUser(U.xavier);
      expect(await q("select name from saved_searches")).toEqual([]);
      await expect(q("insert into saved_searches (brand_org_id, created_by, name) values ($1, $2, 'x')", [f.brokerX, U.xavier])).rejects.toThrow();
    });
  });

  it("caps a team at 25", async () => {
    await as(user(U.alice), async (q) => {
      for (let i = 0; i < 25; i++) await q("insert into saved_searches (brand_org_id, created_by, name) values ($1, $2, $3)", [f.brandA, U.alice, `s${i}`]);
      await expect(q("insert into saved_searches (brand_org_id, created_by, name) values ($1, $2, 'one more')", [f.brandA, U.alice])).rejects.toThrow(/up to 25/);
    });
  });
});
