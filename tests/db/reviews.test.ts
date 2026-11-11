import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);
const be = (id: string) => JSON.stringify({ sub: id, role: "authenticated" });
const BODY = "Got us into 40 Jewel stores in two months. Clear weekly updates.";

describe("reviews and brand references", () => {
  it("a brand can review only after the broker has replied to it", async () => {
    await as(user(U.alice), async (q) => {
      await expect(q("select public.submit_review($1, 5, 'Great', $2, false)", [f.listingX, BODY])).rejects.toThrow(/once they have replied/);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.xavier)]);
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Happy to help')", [f.convAX, U.xavier, f.brokerX]);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.alice)]);
      await q("select public.submit_review($1, 5, 'Great', $2, false)", [f.listingX, BODY]);
      await q("select public.submit_review($1, 4, 'Good', $2, false)", [f.listingX, BODY]); // edit, not a second review
      expect(await q("select rating from broker_reviews")).toEqual([{ rating: 4 }]);
      await expect(q("select public.submit_review($1, 6, null, $2, false)", [f.listingX, BODY])).rejects.toThrow(/check/);
      await expect(q("select public.submit_review($1, 3, null, 'too short', false)", [f.listingX])).rejects.toThrow(/check/);
      // Brand B never talked to broker X.
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.bob)]);
      await expect(q("select public.submit_review($1, 1, null, $2, false)", [f.listingX, BODY])).rejects.toThrow(/once they have replied/);
      // The broker can't review, can't read raw rows, and the public sees it anonymously.
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.xavier)]);
      await expect(q("select public.submit_review($1, 5, null, $2, false)", [f.listingX, BODY])).rejects.toThrow(/once they have replied/);
      expect(await q("select * from broker_reviews")).toHaveLength(0);
      await q("set local role anon");
      await q("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
      const pub = await q<{ author: string; rating: number; mine: boolean }>("select author, rating, mine from public.listing_reviews($1)", [f.listingX]);
      expect(pub).toEqual([{ author: "Brand on Bench", rating: 4, mine: false }]);
      const [r] = await q<{ average: string; reviews: string }>("select average, reviews from public.listing_ratings(array[$1::uuid])", [f.listingX]);
      expect(r).toEqual({ average: "4.0", reviews: "1" });
      await q("set local role postgres");
      expect((await q("select * from email_outbox where kind = 'review_received'")).length).toBeGreaterThan(0);
    });
  });

  it("the broker can reply and flag; Purvey can hide; brand name only by consent", async () => {
    await as(user(U.xavier), async (q) => {
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Happy to help')", [f.convAX, U.xavier, f.brokerX]);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.alice)]);
      const [{ id }] = await q<{ id: string }>("select public.submit_review($1, 2, null, $2, true) as id", [f.listingX, BODY]);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.xavier)]);
      await q("select public.respond_to_review($1, 'Thanks, we fixed the reporting gap.')", [id]);
      await q("select public.flag_review($1, 'Not a client of ours')", [id]);
      const [mine] = await q<{ author: string; response: string; flagged: boolean }>("select author, response, flagged from public.listing_reviews($1)", [f.listingX]);
      expect(mine.author).not.toBe("Brand on Bench"); // brand chose to show its name
      expect(mine.response).toMatch(/fixed/);
      expect(mine.flagged).toBe(true);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.bob)]);
      await expect(q("select public.respond_to_review($1, 'x')", [id])).rejects.toThrow(/not your review/);
      await expect(q("select public.admin_set_review_hidden($1, true, 'x')", [id])).rejects.toThrow(/admin only/);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.pat)]);
      await q("select public.admin_set_review_hidden($1, true, 'Not a real client')", [id]);
      expect(await q("select * from public.listing_reviews($1)", [f.listingX])).toHaveLength(0);
      expect(await q("select * from audit_log where action = 'review.hide'")).toHaveLength(1);
    });
  });

  it("a brand reference goes to Purvey only", async () => {
    await as(user(U.xavier), async (q) => {
      await q("insert into messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Hi')", [f.convAX, U.xavier, f.brokerX]);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.alice)]);
      await q("select public.submit_brand_reference($1, 'Alice A', 'alice@brand.example', null, 'Happy to talk')", [f.listingX]);
      expect(await q("select contact_name from brand_references")).toEqual([{ contact_name: "Alice A" }]);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.xavier)]);
      expect(await q("select * from brand_references")).toHaveLength(0);
      await q("select set_config('request.jwt.claims', $1, true)", [be(U.pat)]);
      const [{ id }] = await q<{ id: string }>("select id from brand_references");
      await q("select public.admin_update_brand_reference($1, 'confirmed', 'Called Alice')", [id]);
      await q("set local role postgres");
      expect((await q("select * from email_outbox where kind = 'admin_reference_offered'")).length).toBeGreaterThan(0);
    });
  });
});
