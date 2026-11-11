import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, closePool, loadFixture, service, superuser, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => {
  f = await loadFixture();
});
afterAll(closePool);

const DENIED = /permission denied|row-level security|only members of a brand|not part of this conversation|42501/i;

describe("acceptance 3: brokers are refused at the database", () => {
  it("a broker cannot insert a conversation (RLS)", async () => {
    await expect(
      as(user(U.xavier), (q) =>
        q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [
          f.brandA, f.brokerX, U.xavier,
        ]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("a broker cannot insert a conversation even with the service role (trigger)", async () => {
    await expect(
      as(service, (q) =>
        q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [
          f.brandA, f.brokerX, U.xavier,
        ]),
      ),
    ).rejects.toThrow(/only members of a brand organization/);
  });

  it("a broker cannot start a conversation by posing as a brokerage-to-brokerage thread", async () => {
    await expect(
      as(service, (q) =>
        q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [
          f.brokerY, f.brokerX, U.yolanda,
        ]),
      ),
    ).rejects.toThrow(/only members of a brand organization/);
  });

  it("a broker cannot read any brief", async () => {
    const rows = await as(user(U.xavier), (q) => q("select * from briefs"));
    expect(rows).toHaveLength(0);
  });

  it("a broker cannot list brands", async () => {
    // Broker Y has no conversations: sees no brand organizations at all.
    const y = await as(user(U.yolanda), (q) => q("select id from organizations where type = 'brand'"));
    expect(y).toHaveLength(0);
    // Broker X sees only the brand that messaged it, never brand B.
    const x = await as(user(U.xavier), (q) => q<{ id: string }>("select id from organizations where type = 'brand'"));
    expect(x.map((r) => r.id)).toEqual([f.brandA]);
  });

  it("a broker sees only the brand profiles of brands that messaged it, and never saved brokers or placement requests", async () => {
    await as(user(U.xavier), async (q) => {
      // Brand A started a conversation with broker X; brand B did not.
      expect((await q<{ org_id: string }>("select org_id from brand_profiles")).map((r) => r.org_id)).toEqual([f.brandA]);
      expect(await q("select * from saved_brokers")).toHaveLength(0);
      expect(await q("select * from placement_requests")).toHaveLength(0);
    });
  });

  it("a broker cannot read raw profile events (which name brands)", async () => {
    await as(user(U.xavier), async (q) => {
      await q("select public.reveal_contact($1)", [f.listingX]).catch(() => {}); // not a brand: refused
      expect(await q("select * from profile_events")).toHaveLength(0);
    });
  });
});

describe("listing visibility", () => {
  it("anon sees the live listing and not the draft", async () => {
    const rows = await as(anon, (q) => q<{ id: string }>("select id from broker_listings"));
    expect(rows.map((r) => r.id)).toEqual([f.listingX]);
  });

  it("anon sees live brokerages only, never brands", async () => {
    const rows = await as(anon, (q) => q<{ id: string }>("select id from organizations"));
    expect(rows.map((r) => r.id)).toEqual([f.brokerX]);
  });

  it("a broker always sees its own draft listing", async () => {
    const rows = await as(user(U.yolanda), (q) => q<{ id: string }>("select id from broker_listings where org_id = $1", [f.brokerY]));
    expect(rows).toHaveLength(1);
  });

  it("an admin-paused listing leaves search", async () => {
    await as(user(U.pat), async (q) => {
      await q("select public.admin_pause_listing($1, true, 'test')", [f.listingX]);
      await q("select set_config('request.jwt.claims', '{}', true)");
      await q("set local role anon");
      expect(await q("select id from broker_listings")).toHaveLength(0);
    });
  });
});

describe("contact details", () => {
  it("are not readable directly by anon or brands", async () => {
    await expect(as(anon, (q) => q("select * from broker_contacts"))).rejects.toThrow(/permission denied/);
    expect(await as(user(U.alice), (q) => q("select * from broker_contacts"))).toHaveLength(0);
  });

  it("are revealed to a brand through reveal_contact, logged once per brand", async () => {
    await as(user(U.alice), async (q) => {
      const [c] = await q<{ email: string }>("select * from public.reveal_contact($1)", [f.listingX]);
      expect(c.email).toBe("xavier@lakeshore.example");
      await q("select * from public.reveal_contact($1)", [f.listingX]);
      await q("set local role postgres");
      const ev = await q("select * from profile_events where type = 'contact_reveal' and brand_org_id = $1", [f.brandA]);
      expect(ev).toHaveLength(1);
    });
  });

  it("are refused to brokers and anon", async () => {
    await expect(as(user(U.yolanda), (q) => q("select * from public.reveal_contact($1)", [f.listingX]))).rejects.toThrow(/brand account/);
    await expect(as(anon, (q) => q("select * from public.reveal_contact($1)", [f.listingX]))).rejects.toThrow(/permission denied/);
  });

  it("are capped at 50 new reveals per brand per day", async () => {
    await as(superuser, async (q) => {
      await q(
        `insert into profile_events (listing_id, type, brand_org_id)
         select $1, 'contact_reveal', $2 from generate_series(1, 50)`,
        [f.listingY, f.brandB],
      );
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.bob })]);
      await q("set local role authenticated");
      await expect(q("select * from public.reveal_contact($1)", [f.listingX])).rejects.toThrow(/50 contact reveals/);
    });
  });
});

describe("references and documents", () => {
  it("brands and other brokers cannot read references; admins can", async () => {
    expect(await as(user(U.alice), (q) => q("select * from broker_references"))).toHaveLength(0);
    expect(await as(user(U.yolanda), (q) => q("select * from broker_references"))).toHaveLength(0);
    expect(await as(user(U.pat), (q) => q("select * from broker_references"))).toHaveLength(2);
    await expect(as(anon, (q) => q("select * from broker_references"))).rejects.toThrow(/permission denied/);
  });

  it("private documents are hidden from brands", async () => {
    await as(superuser, async (q) => {
      await q(
        `insert into listing_documents (listing_id, storage_path, file_name, mime_type, size_bytes, is_private)
         values ($1, 'x/public.pdf', 'Line card.pdf', 'application/pdf', 1000, false),
                ($1, 'x/private.pdf', 'Financials.pdf', 'application/pdf', 1000, true)`,
        [f.listingX],
      );
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await q("set local role authenticated");
      const docs = await q<{ file_name: string }>("select file_name from listing_documents");
      expect(docs.map((d) => d.file_name)).toEqual(["Line card.pdf"]);
    });
  });
});

describe("briefs are private to the brand's own team", () => {
  it("teammates can read, other brands and admins cannot", async () => {
    expect(await as(user(U.amy), (q) => q("select * from briefs"))).toHaveLength(1);
    expect(await as(user(U.bob), (q) => q("select * from briefs"))).toHaveLength(0);
    expect(await as(user(U.pat), (q) => q("select * from briefs"))).toHaveLength(0);
  });

  it("the broker sees only the one-time summary on its conversation", async () => {
    const [c] = await as(user(U.xavier), (q) => q<{ brief_summary: { title: string } }>("select brief_summary from conversations where id = $1", [f.convAX]));
    expect(c.brief_summary.title).toBe("Midwest jerky launch");
  });

  it("a brand cannot inject a summary or attach another brand's brief", async () => {
    await as(user(U.alice), async (q) => {
      // Injected summary is replaced by the server-built one (null without a brief).
      const [c] = await q<{ brief_summary: unknown }>(
        `insert into conversations (brand_org_id, broker_org_id, started_by, brief_summary)
         values ($1, $2, $3, '{"title":"forged"}') returning brief_summary`,
        [f.brandA, f.brokerX, U.alice],
      );
      expect(c.brief_summary).toBeNull();
    });
    await expect(
      as(user(U.bob), (q) =>
        q("insert into conversations (brand_org_id, broker_org_id, started_by, brief_id) values ($1, $2, $3, $4)", [
          f.brandB, f.brokerX, U.bob, f.briefA,
        ]),
      ),
    ).rejects.toThrow(/brief not found/);
  });
});

describe("conversations and messages", () => {
  it("a brand can start a conversation only with a live listing", async () => {
    await expect(
      as(user(U.bob), (q) =>
        q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [f.brandB, f.brokerY, U.bob]),
      ),
    ).rejects.toThrow(/not available/);
  });

  it("a brand cannot start a conversation on behalf of another brand", async () => {
    await expect(
      as(user(U.bob), (q) =>
        q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [f.brandA, f.brokerX, U.bob]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("limits a brand to 25 new conversations a day", async () => {
    await as(user(U.bob), async (q) => {
      for (let i = 0; i < 25; i++) {
        await q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [f.brandB, f.brokerX, U.bob]);
      }
      await expect(
        q("insert into conversations (brand_org_id, broker_org_id, started_by) values ($1, $2, $3)", [f.brandB, f.brokerX, U.bob]),
      ).rejects.toThrow(/25 new conversations/);
    });
  });

  it("only the two organizations can read the thread", async () => {
    expect(await as(user(U.xena), (q) => q("select * from messages"))).toHaveLength(1);
    expect(await as(user(U.amy), (q) => q("select * from messages"))).toHaveLength(1);
    expect(await as(user(U.bob), (q) => q("select * from messages"))).toHaveLength(0);
    expect(await as(user(U.yolanda), (q) => q("select * from messages"))).toHaveLength(0);
    expect(await as(user(U.pat), (q) => q("select * from messages"))).toHaveLength(0);
  });

  it("the broker can reply in the thread a brand opened, and its stage moves to Replied", async () => {
    await as(user(U.xena), async (q) => {
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Happy to talk')", [
        f.convAX, U.xena, f.brokerX,
      ]);
      const [side] = await q<{ broker_stage: string }>("select broker_stage from conversation_sides where conversation_id = $1", [f.convAX]);
      expect(side.broker_stage).toBe("replied");
    });
  });

  it("a broker cannot post into a conversation it is not part of", async () => {
    await expect(
      as(user(U.yolanda), (q) =>
        q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'hi')", [
          f.convAX, U.yolanda, f.brokerY,
        ]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("a sender cannot impersonate a teammate or the other side", async () => {
    await expect(
      as(user(U.xena), (q) =>
        q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'hi')", [
          f.convAX, U.alice, f.brandA,
        ]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("each side's stage is invisible to the other side", async () => {
    const x = await as(user(U.xavier), (q) => q<{ org_id: string }>("select org_id from conversation_sides"));
    expect(x.map((r) => r.org_id)).toEqual([f.brokerX]);
    const a = await as(user(U.alice), (q) => q<{ org_id: string }>("select org_id from conversation_sides"));
    expect(a.map((r) => r.org_id)).toEqual([f.brandA]);
  });

  it("a brand cannot set a broker stage", async () => {
    await expect(
      as(user(U.alice), (q) =>
        q("update conversation_sides set brand_stage = null, broker_stage = 'won' where org_id = $1", [f.brandA]),
      ),
    ).rejects.toThrow(/stage does not match/);
  });

  it("notes are private to the org that wrote them", async () => {
    await as(user(U.alice), async (q) => {
      await q("insert into conversation_notes (conversation_id, org_id, author_user_id, body) values ($1, $2, $3, 'private')", [
        f.convAX, f.brandA, U.alice,
      ]);
      expect(await q("select * from conversation_notes")).toHaveLength(1);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      expect(await q("select * from conversation_notes")).toHaveLength(0);
    });
  });

  it("a declined conversation is closed to both sides; only the broker can decline", async () => {
    await expect(
      as(user(U.alice), (q) => q("select public.decline_conversation($1, 'not_a_fit')", [f.convAX])),
    ).rejects.toThrow(/only the broker/);
    await as(user(U.xavier), async (q) => {
      await q("select public.decline_conversation($1, 'category_conflict', 'We carry a competitor')", [f.convAX]);
      await expect(
        q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'x')", [f.convAX, U.xavier, f.brokerX]),
      ).rejects.toThrow(/closed/);
    });
  });

  it("blocking stops new messages from that organization", async () => {
    await as(user(U.xavier), async (q) => {
      await q("insert into org_blocks (blocker_org_id, blocked_org_id, created_by) values ($1, $2, $3)", [f.brokerX, f.brandA, U.xavier]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await expect(
        q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'x')", [f.convAX, U.alice, f.brandA]),
      ).rejects.toThrow(/blocked/);
    });
  });
});

describe("admin access to threads", () => {
  it("admins cannot read a thread until it is reported, and every read is audited", async () => {
    await as(user(U.pat), async (q) => {
      await expect(q("select * from public.admin_read_thread($1)", [f.convAX])).rejects.toThrow(/reported/);
    });
    await as(user(U.alice), async (q) => {
      await q("insert into reports (reporter_user_id, reporter_org_id, conversation_id, reason) values ($1, $2, $3, 'spam')", [
        U.alice, f.brandA, f.convAX,
      ]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.pat })]);
      const msgs = await q("select * from public.admin_read_thread($1)", [f.convAX]);
      expect(msgs).toHaveLength(1);
      const log = await q<{ action: string }>("select action from audit_log where target_id = $1", [f.convAX]);
      expect(log.map((l) => l.action)).toContain("conversation.admin_read");
    });
  });

  it("non-admins cannot call admin_read_thread", async () => {
    await expect(as(user(U.alice), (q) => q("select * from public.admin_read_thread($1)", [f.convAX]))).rejects.toThrow(/admin only/);
  });

  it("the audit log is append-only, even for the service role", async () => {
    await expect(as(service, (q) => q("delete from audit_log"))).rejects.toThrow(/append-only/);
  });
});

describe("listing status is set only by billing sync or an admin", () => {
  it("a broker cannot set status, admin_paused, verified_at or completeness", async () => {
    for (const col of ["status = 'live'", "admin_paused = false", "verified_at = now()", "completeness = 100"]) {
      await expect(
        as(user(U.yolanda), (q) => q(`update broker_listings set ${col} where org_id = $1`, [f.brokerY])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("a broker can edit its own listing but not another brokerage's", async () => {
    await as(user(U.yolanda), async (q) => {
      const own = await q("update broker_listings set about = 'Pacific Northwest naturals' where org_id = $1 returning id", [f.brokerY]);
      expect(own).toHaveLength(1);
      const other = await q("update broker_listings set about = 'hijack' where org_id = $1 returning id", [f.brokerX]);
      expect(other).toHaveLength(0);
    });
  });

  it("sync functions are not callable by clients", async () => {
    await expect(as(user(U.xavier), (q) => q("select public.sync_listing_status($1)", [f.brokerX]))).rejects.toThrow(/permission denied/);
  });

  it("past_due keeps the listing live for 7 days, then pauses it; paying restores it", async () => {
    await as(service, async (q) => {
      await q("update subscriptions set comped = false, status = 'past_due', past_due_since = now() - interval '6 days' where org_id = $1", [f.brokerX]);
      expect((await q<{ s: string }>("select public.sync_listing_status($1) as s", [f.brokerX]))[0].s).toBe("live");
      await q("update subscriptions set past_due_since = now() - interval '8 days' where org_id = $1", [f.brokerX]);
      expect((await q<{ s: string }>("select public.sync_listing_status($1) as s", [f.brokerX]))[0].s).toBe("paused");
      await q("set local role anon");
      expect(await q("select id from broker_listings")).toHaveLength(0);
      await q("set local role service_role");
      await q("update subscriptions set status = 'active', past_due_since = null where org_id = $1", [f.brokerX]);
      expect((await q<{ s: string }>("select public.sync_listing_status($1) as s", [f.brokerX]))[0].s).toBe("live");
    });
  });

  it("cancel at period end stays live while active; a cancelled subscription pauses", async () => {
    await as(service, async (q) => {
      await q("update subscriptions set comped = false, status = 'active', cancel_at_period_end = true, current_period_end = now() + interval '3 days' where org_id = $1", [f.brokerX]);
      expect((await q<{ s: string }>("select public.sync_listing_status($1) as s", [f.brokerX]))[0].s).toBe("live");
      // Even with time left on the period, an immediate cancellation (e.g. dunning ended) pauses.
      await q("update subscriptions set status = 'canceled' where org_id = $1", [f.brokerX]);
      expect((await q<{ s: string }>("select public.sync_listing_status($1) as s", [f.brokerX]))[0].s).toBe("paused");
    });
  });

  it("only admins can comp; comping puts a submitted listing live without Stripe", async () => {
    await expect(as(user(U.yolanda), (q) => q("select public.admin_set_comp($1, true)", [f.brokerY]))).rejects.toThrow(/admin only/);
    await as(user(U.pat), async (q) => {
      expect((await q<{ s: string }>("select public.admin_set_comp($1, true) as s", [f.brokerY]))[0].s).toBe("live");
    });
  });
});

describe("verification is decided only by Purvey admins", () => {
  it("a broker cannot write verifications directly", async () => {
    await expect(
      as(user(U.xavier), (q) => q("insert into verifications (listing_id, status) values ($1, 'verified')", [f.listingX])),
    ).rejects.toThrow(/permission denied/);
  });

  it("requesting needs 80% profile strength", async () => {
    await expect(as(user(U.yolanda), (q) => q("select public.request_verification()"))).rejects.toThrow(/80%/);
  });

  it("an admin verifies after the checklist and the badge is set; brokers cannot decide", async () => {
    await as(superuser, async (q) => {
      // Bring listing X to full strength: add a logo and a document.
      await q("update organizations set logo_url = 'https://example.test/logo.png' where id = $1", [f.brokerX]);
      await q(`insert into listing_documents (listing_id, storage_path, file_name, mime_type, size_bytes)
               values ($1, 'x/lc.pdf', 'Line card.pdf', 'application/pdf', 100)`, [f.listingX]);
      const [{ completeness }] = await q<{ completeness: number }>("select completeness from broker_listings where id = $1", [f.listingX]);
      expect(completeness).toBeGreaterThanOrEqual(80);

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      await q("set local role authenticated");
      const [{ v }] = await q<{ v: string }>("select public.request_verification() as v");
      await expect(q("select public.admin_decide_verification($1, 'verified')", [v])).rejects.toThrow(/admin only/);
      // The broker cannot read Purvey's private review notes.
      expect(await q("select * from verification_reviews")).toHaveLength(0);

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.pat })]);
      await expect(q("select public.admin_decide_verification($1, 'verified')", [v])).rejects.toThrow(/checklist/);
      await q("select public.admin_update_verification_review($1, true, true, 'Both refs called')", [v]);
      await q("select public.admin_decide_verification($1, 'verified')", [v]);
      const [l] = await q<{ verified_at: string | null }>("select verified_at from broker_listings where id = $1", [f.listingX]);
      expect(l.verified_at).not.toBeNull();
    });
  });
});

describe("accounts and organizations", () => {
  it("a user cannot make themselves an admin or change their role", async () => {
    await expect(as(user(U.alice), (q) => q("update users set is_admin = true where id = $1", [U.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(user(U.alice), (q) => q("update users set role = 'broker' where id = $1", [U.alice]))).rejects.toThrow(/permission denied/);
  });

  it("a user belongs to one organization", async () => {
    await expect(as(user(U.alice), (q) => q("select public.create_organization('brand', 'Second Co')"))).rejects.toThrow(/already belong/);
  });

  it("a new user creates an organization and becomes its owner", async () => {
    await as(user(U.newbie), async (q) => {
      const [org] = await q<{ slug: string; type: string }>("select * from public.create_organization('broker', 'Lakeshore Sales')");
      expect(org.type).toBe("broker");
      expect(org.slug).toBe("lakeshore-sales-2");
      const [m] = await q<{ role: string }>("select role from org_members where user_id = $1", [U.newbie]);
      expect(m.role).toBe("owner");
    });
  });

  it("members cannot invite; owners can; the last owner cannot leave", async () => {
    await expect(as(user(U.amy), (q) => q("select public.create_invite('z@example.test')"))).rejects.toThrow(/only owners/);
    await expect(as(user(U.alice), (q) => q("select public.remove_member($1)", [U.alice]))).rejects.toThrow(/at least one owner/);
  });

  it("a brand member cannot edit the company profile; the owner can", async () => {
    const amy = await as(user(U.amy), (q) => q("update organizations set name = 'X' where id = $1 returning id", [f.brandA]));
    expect(amy).toHaveLength(0);
    const alice = await as(user(U.alice), (q) => q("update organizations set name = 'Acme Snacks Co' where id = $1 returning id", [f.brandA]));
    expect(alice).toHaveLength(1);
  });

  it("users see teammates but not other organizations' people", async () => {
    const rows = await as(user(U.alice), (q) => q<{ id: string }>("select id from users order by id"));
    expect(rows.map((r) => r.id).sort()).toEqual([U.alice, U.amy].sort());
  });

  it("reference lists are public to read and admin-only to write", async () => {
    expect((await as(anon, (q) => q("select * from states"))).length).toBe(51);
    await expect(as(user(U.alice), (q) => q("insert into retailers (name, slug) values ('Fake', 'fake')"))).rejects.toThrow(DENIED);
    const ok = await as(user(U.pat), (q) => q("insert into retailers (name, slug) values ('New Mart', 'new-mart') returning id"));
    expect(ok).toHaveLength(1);
  });
});

describe("analytics", () => {
  it("brokers get aggregate counts only", async () => {
    await as(user(U.alice), (q) => q("select public.log_profile_events($1, 'profile_view')", [[f.listingX]]));
    const rows = await as(user(U.xavier), async (q) => {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await q("select public.log_profile_events($1, 'profile_view')", [[f.listingX]]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      return q<{ type: string; total: string }>("select * from public.listing_analytics(30)");
    });
    const views = rows.find((r) => r.type === "profile_view");
    expect(Number(views?.total)).toBe(1);
    expect(Object.keys(rows[0])).toEqual(["day", "type", "total"]);
  });
});
