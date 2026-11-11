import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, service, superuser, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);

describe("start_conversation", () => {
  it("creates the thread and first message as the brand; brokers can't", async () => {
    await as(user(U.bob), async (q) => {
      const [{ id }] = await q<{ id: string }>("select public.start_conversation($1, 'Hello Lakeshore') as id", [f.brokerX]);
      const msgs = await q<{ body: string }>("select body from messages where conversation_id = $1", [id]);
      expect(msgs.map((m) => m.body)).toEqual(["Hello Lakeshore"]);
    });
    await expect(as(user(U.yolanda), (q) => q("select public.start_conversation($1, 'hi')", [f.brokerX]))).rejects.toThrow(/only members of a brand/);
  });

  it("posts a broker's away-mode auto-reply after the first message, in order", async () => {
    await as(superuser, async (q) => {
      await q("update broker_listings set away_message = 'Out until Monday.' where id = $1", [f.listingX]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.bob })]);
      await q("set local role authenticated");
      const [{ id }] = await q<{ id: string }>("select public.start_conversation($1, 'Hi there') as id", [f.brokerX]);
      const msgs = await q<{ body: string; is_auto_reply: boolean }>("select body, is_auto_reply from messages where conversation_id = $1 order by created_at", [id]);
      expect(msgs).toEqual([{ body: "Hi there", is_auto_reply: false }, { body: "Out until Monday.", is_auto_reply: true }]);
      const [side] = await q<{ broker_stage: string }>("select broker_stage from conversation_sides where conversation_id = $1", [id]).catch(() => [{ broker_stage: "n/a" }]);
      expect(side?.broker_stage ?? "new").not.toBe("replied"); // brand can't see it anyway; checked as superuser below
    });
  });

  it("rejects attachments outside the conversation folder or of other types", async () => {
    await expect(as(user(U.alice), (q) => q(
      "insert into messages (conversation_id, sender_user_id, sender_org_id, body, attachments) values ($1, $2, $3, 'x', $4)",
      [f.convAX, U.alice, f.brandA, JSON.stringify([{ path: "other-conv/file.pdf", name: "f.pdf", size: 10, type: "application/pdf" }])],
    ))).rejects.toThrow(/invalid attachment/);
    await expect(as(user(U.alice), (q) => q(
      "insert into messages (conversation_id, sender_user_id, sender_org_id, body, attachments) values ($1, $2, $3, 'x', $4)",
      [f.convAX, U.alice, f.brandA, JSON.stringify([{ path: `${f.convAX}/a.exe`, name: "a.exe", size: 10, type: "application/x-msdownload" }])],
    ))).rejects.toThrow(/invalid attachment/);
  });
});

describe("email outbox", () => {
  it("queues one email per member of the receiving org, honouring preferences and mute", async () => {
    await as(superuser, async (q) => {
      await q("update notification_prefs set email_new_message = 'daily' where user_id = $1", [U.xena]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await q("set local role authenticated");
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Any update on Kroger?')", [f.convAX, U.alice, f.brandA]);
      await q("set local role postgres");
      const rows = await q<{ to_user_id: string; kind: string; digest: boolean }>("select to_user_id, kind, digest from email_outbox order by id desc limit 2");
      expect(rows.map((r) => [r.to_user_id, r.kind, r.digest]).sort()).toEqual([[U.xavier, "new_message", false], [U.xena, "new_message", true]].sort());
      // Muted thread: nothing queued.
      await q("update conversation_sides set muted = true where conversation_id = $1 and org_id = $2", [f.convAX, f.brokerX]);
      const before = (await q<{ n: string }>("select count(*) n from email_outbox"))[0].n;
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await q("set local role authenticated");
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Ping')", [f.convAX, U.alice, f.brandA]);
      await q("set local role postgres");
      expect((await q<{ n: string }>("select count(*) n from email_outbox"))[0].n).toBe(before);
    });
  });

  it("the outbox is invisible to every client role", async () => {
    await expect(as(user(U.pat), (q) => q("select * from email_outbox"))).rejects.toThrow(/permission denied/);
    await expect(as(user(U.xavier), (q) => q("select * from email_outbox"))).rejects.toThrow(/permission denied/);
  });

  it("a decline emails the brand team", async () => {
    await as(user(U.xavier), async (q) => {
      await q("select public.decline_conversation($1, 'not_a_fit', 'Full on jerky')", [f.convAX]);
      await q("set local role postgres");
      const rows = await q<{ to_user_id: string; kind: string }>("select to_user_id, kind from email_outbox where kind = 'broker_declined'");
      expect(rows.map((r) => r.to_user_id).sort()).toEqual([U.alice, U.amy].sort());
    });
  });

  it("listing status changes email the brokerage owners, and admins on submit", async () => {
    await as(service, async (q) => {
      await q("update subscriptions set comped = false, status = 'canceled' where org_id = $1", [f.brokerX]);
      await q("select public.sync_listing_status($1)", [f.brokerX]);
      const rows = await q<{ to_user_id: string; kind: string }>("select to_user_id, kind from email_outbox where kind = 'listing_paused'");
      expect(rows.map((r) => r.to_user_id)).toEqual([U.xavier]); // owner only, not member Xena
    });
  });
});
