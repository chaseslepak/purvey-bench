import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);

describe("admin console support", () => {
  it("only admins get overview stats", async () => {
    const [{ s }] = await as(user(U.pat), (q) => q<{ s: Record<string, number> }>("select public.admin_stats() as s"));
    expect(s).toMatchObject({ live_listings: 1, brands: 2, conversations: 1, reply_rate: 0 });
    await expect(as(user(U.alice), (q) => q("select public.admin_stats()"))).rejects.toThrow(/admin only/);
  });

  it("admin_log writes the audit log; non-admins can't", async () => {
    await as(user(U.pat), async (q) => {
      await q("select public.admin_log('placement.status', 'placement_request', 'x', '{\"to\":\"contacted\"}')");
      const [r] = await q<{ action: string; actor_user_id: string }>("select action, actor_user_id from audit_log order by id desc limit 1");
      expect(r).toEqual({ action: "placement.status", actor_user_id: U.pat });
    });
    await expect(as(user(U.xavier), (q) => q("select public.admin_log('x', 'y', 'z')"))).rejects.toThrow(/admin only/);
  });

  it("either party can request a commission audit; admins then read the records, logged", async () => {
    await expect(as(user(U.pat), (q) => q("select * from public.admin_read_true_up($1)", [f.convAX]))).rejects.toThrow(/after an audit is requested/);
    await as(user(U.xavier), async (q) => {
      await q("select public.request_commission_audit($1, 'Please check Q1')", [f.convAX]);
      expect(await q("select * from audit_requests")).toHaveLength(1);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.bob })]);
      await expect(q("select public.request_commission_audit($1, 'x')", [f.convAX])).rejects.toThrow(/not your conversation/);
      expect(await q("select * from audit_requests")).toHaveLength(0);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.pat })]);
      await q("select * from public.admin_read_true_up($1)", [f.convAX]);
      const log = await q<{ action: string }>("select action from audit_log where target_id = $1", [f.convAX]);
      expect(log.map((l) => l.action)).toContain("true_up.admin_read");
      await q("set local role postgres");
      expect((await q("select * from email_outbox where kind = 'admin_audit_requested'")).length).toBeGreaterThan(0);
    });
  });

  it("resolving a report can warn, block or pause, and is audited", async () => {
    const asUser = (q: (sql: string, p?: unknown[]) => Promise<unknown>, id: string) => q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id })]);
    await as(user(U.alice), async (q) => {
      await q("insert into reports (reporter_user_id, reporter_org_id, conversation_id, reason) values ($1, $2, $3, 'spam')", [U.alice, f.brandA, f.convAX]);
      await expect(q("select public.admin_resolve_report(gen_random_uuid(), 'resolved', 'x')")).rejects.toThrow(/admin only/);
    });
    await as(user(U.alice), async (q) => {
      await q("insert into reports (reporter_user_id, reporter_org_id, conversation_id, reason) values ($1, $2, $3, 'spam')", [U.alice, f.brandA, f.convAX]);
      await asUser(q, U.pat);
      const [{ id }] = await q<{ id: string }>("select id from reports limit 1");
      await expect(q("select public.admin_resolve_report($1, 'resolved', 'x', 'warn', '')", [id])).rejects.toThrow(/write the warning/);
      await q("select public.admin_resolve_report($1, 'resolved', 'Blocked', 'block')", [id]);
      await q("select public.admin_resolve_report($1, 'resolved', 'Warned', 'warn', 'Please keep messages on topic.')", [id]);
      await q("select public.admin_resolve_report($1, 'resolved', 'Paused', 'pause', 'Spam')", [id]);
      await q("set local role postgres");
      expect(await q("select * from org_blocks where blocker_org_id = $1 and blocked_org_id = $2", [f.brandA, f.brokerX])).toHaveLength(1);
      expect((await q("select * from email_outbox where kind = 'admin_warning'")).length).toBe(1);
      const [l] = await q<{ admin_paused: boolean }>("select admin_paused from broker_listings where id = $1", [f.listingX]);
      expect(l.admin_paused).toBe(true);
      const [r] = await q<{ status: string; resolved_at: Date | null }>("select status, resolved_at from reports where id = $1", [id]);
      expect(r.status).toBe("resolved"); expect(r.resolved_at).not.toBeNull();
      expect((await q("select * from audit_log where action = 'report.resolved'")).length).toBe(3);
    });
  });

  it("only admins record reference checks", async () => {
    await as(user(U.xavier), async (q) => {
      await q("insert into broker_references (listing_id, name, brand) values ($1, 'Ref One', 'Acme')", [f.listingX]);
      const [{ id }] = await q<{ id: string }>("select id from broker_references limit 1");
      await expect(q("select public.admin_update_reference($1, 'confirmed', 'self-confirm')", [id])).rejects.toThrow(/admin only/);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.pat })]);
      await q("select public.admin_update_reference($1, 'confirmed', 'Spoke with Jen, glowing')", [id]);
      const [r] = await q<{ status: string; admin_notes: string }>("select status, admin_notes from broker_references where id = $1", [id]);
      expect(r).toEqual({ status: "confirmed", admin_notes: "Spoke with Jen, glowing" });
    });
  });

  it("an admin who wrote audit entries can still be deleted; the entry keeps who it was", async () => {
    await as(user(U.pat), async (q) => {
      await q("select public.admin_log('x.test', 'y', 'z')");
      await q("set local role postgres");
      const [e] = await q<{ actor_email: string }>("select actor_email from audit_log where action = 'x.test'");
      expect(e.actor_email).toMatch(/@/);
      await q("delete from public.users where id = $1", [U.pat]);
      expect(await q("select * from audit_log where action = 'x.test' and actor_user_id = $1", [U.pat])).toHaveLength(1);
    });
  });
});
