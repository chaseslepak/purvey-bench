import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closePool, loadFixture, user } from "./db";
import { U, type Fixture } from "./fixtures";

let f: Fixture;
beforeAll(async () => { f = await loadFixture(); });
afterAll(closePool);

describe("progress board", () => {
  it("the broker adds accounts and posts updates; the brand reads and thanks", async () => {
    await as(user(U.xena), async (q) => {
      const [{ id: kroger }] = await q<{ id: number }>("select id from retailers where slug = 'kroger'");
      const [{ id: acct }] = await q<{ id: string }>("insert into deal_accounts (conversation_id, retailer_id, stores) values ($1, $2, 410) returning id", [f.convAX, kroger]);
      const [u] = await q<{ id: string; from_stage: string }>(
        "insert into deal_updates (conversation_id, account_id, author_user_id, to_stage, note, next_step) values ($1, $2, $3, 'category_review', 'In the March review with 3 SKUs', 'Send pricing') returning id, from_stage",
        [f.convAX, acct, U.xena]);
      expect(u.from_stage).toBe("targeted");
      const [a] = await q<{ stage: string }>("select stage from deal_accounts where id = $1", [acct]);
      expect(a.stage).toBe("category_review");

      // Brand side: reads everything, can thank, can't post or edit the board.
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.amy })]);
      expect(await q("select * from deal_updates")).toHaveLength(1);
      await q("insert into deal_update_thanks (update_id, org_id, user_id) values ($1, $2, $3)", [u.id, f.brandA, U.amy]);
      await expect(q("insert into deal_updates (conversation_id, account_id, author_user_id, to_stage, note) values ($1, $2, $3, 'on_shelf', 'x')", [f.convAX, acct, U.amy])).rejects.toThrow(/row-level security/);
      expect(await q("update deal_accounts set stage = 'on_shelf' where id = $1 returning id", [acct])).toHaveLength(0);
      // The brand team was emailed about the update.
      await q("set local role postgres");
      const mail = await q<{ to_user_id: string }>("select to_user_id from email_outbox where kind = 'deal_update'");
      expect(mail.map((m) => m.to_user_id).sort()).toEqual([U.alice, U.amy].sort());
    });
  });

  it("another brokerage sees nothing", async () => {
    await as(user(U.xena), (q) => q("insert into deal_accounts (conversation_id, custom_name) values ($1, 'Rosauers')", [f.convAX]));
    expect(await as(user(U.yolanda), (q) => q("select * from deal_accounts"))).toHaveLength(0);
    expect(await as(user(U.bob), (q) => q("select * from commission_periods"))).toHaveLength(0);
  });
});

describe("toolbox", () => {
  it("both sides share files; only the uploader's org deletes; the brand sees when the broker opens one", async () => {
    await as(user(U.alice), async (q) => {
      const [{ id }] = await q<{ id: string }>(
        "insert into toolbox_files (conversation_id, org_id, folder, file_name, storage_path, mime_type, size_bytes, created_by) values ($1, $2, 'Sell sheets', 'Sell sheet v3.pdf', $3, 'application/pdf', 1000, $4) returning id",
        [f.convAX, f.brandA, `${f.convAX}/a.pdf`, U.alice]);
      await expect(q("insert into toolbox_files (conversation_id, org_id, folder, file_name, storage_path, mime_type, size_bytes, created_by) values ($1, $2, 'Decks', 'x.pdf', 'elsewhere/x.pdf', 'application/pdf', 10, $3)", [f.convAX, f.brandA, U.alice])).rejects.toThrow(/row-level security/);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      expect(await q("select * from toolbox_files")).toHaveLength(1);
      expect(await q("delete from toolbox_files where id = $1 returning id", [id])).toHaveLength(0);
      await q("select public.log_toolbox_open($1)", [id]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      const ev = await q<{ org_id: string }>("select org_id from toolbox_file_events where file_id = $1", [id]);
      expect(ev.map((e) => e.org_id)).toEqual([f.brokerX]);
    });
  });
});

describe("commission true-up", () => {
  const lines = [
    { account: "Jewel-Osco", distributor: "UNFI", units: 3564, gross: 15503, deductions: 2480, covered: true },
    { account: "Natural independents", distributor: "UNFI", units: 4120, gross: 17304, deductions: 1730, covered: false },
  ];

  it("brand uploads, broker adjusts and invoices, brand questions, broker re-invoices, brand marks paid", async () => {
    await as(user(U.xavier), async (q) => {
      await q("insert into deal_terms (conversation_id, rate, retainer, retainer_from, retainer_to, updated_by) values ($1, 5, 1500, '2027-02-01', '2027-04-30', $2)", [f.convAX, U.xavier]);
      // A broker can't upload the brand's sales report.
      await expect(q("select public.true_up_upload_report($1, '2027-03-01', $2, 'r.csv', $3)", [f.convAX, `${f.convAX}/r.csv`, JSON.stringify(lines)])).rejects.toThrow(/only the brand/);

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await expect(q("update deal_terms set rate = 1 where conversation_id = $1 returning rate", [f.convAX]).then((r) => r.length)).resolves.toBe(0);
      const [{ id }] = await q<{ id: string }>("select public.true_up_upload_report($1, '2027-03-15', $2, 'UNFI March.csv', $3) as id", [f.convAX, `${f.convAX}/r.csv`, JSON.stringify(lines)]);
      await expect(q("select public.true_up_invoice($1)", [id])).rejects.toThrow(/only the broker/);

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      // The broker can't change the brand's figures, only coverage and adjustments.
      const tampered = [{ ...lines[0], gross: 99999 }, lines[1]];
      await expect(q("select public.true_up_edit($1, $2, '[]')", [id, JSON.stringify(tampered)])).rejects.toThrow(/can't be changed/);
      await q("select public.true_up_edit($1, $2, $3)", [id, JSON.stringify(lines), JSON.stringify([{ label: "Spoils credit", amount: -120 }])]);
      const [{ no }] = await q<{ no: string }>("select public.true_up_invoice($1) as no", [id]);
      expect(no).toMatch(/^[A-Z]{1,3}-\d{4}-\d{3}$/);
      const [p] = await q<{ status: string; totals: Record<string, number> }>("select status, totals from commission_periods where id = $1", [id]);
      // covered net 15503 - 2480 = 13023; 5% = 651.15; retainer 1500 (March inside Feb-Apr); -120
      expect(p.status).toBe("invoiced");
      expect(p.totals).toEqual({ covered_net: 13023, commission: 651.15, retainer: 1500, adjustments: -120, total: 2031.15 });
      await expect(q("select public.true_up_mark_paid($1, current_date, 'ACH', 'x')", [id])).rejects.toThrow(/only the brand/);

      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await q("select public.true_up_question($1, 'Jewel deductions look high')", [id]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.xavier })]);
      await q("select public.true_up_edit($1, $2, '[]')", [id, JSON.stringify(lines)]);
      await q("select public.true_up_invoice($1)", [id]);
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U.alice })]);
      await q("select public.true_up_mark_paid($1, '2027-04-20', 'ACH', '004471')", [id]);
      const [done] = await q<{ status: string; paid_method: string; totals: Record<string, number> }>("select status, paid_method, totals from commission_periods where id = $1", [id]);
      expect(done).toMatchObject({ status: "paid", paid_method: "ACH" });
      expect(done.totals.total).toBe(2151.15);

      await q("set local role postgres");
      const kinds = (await q<{ kind: string }>("select kind from email_outbox where kind like 'true_up_%' order by id")).map((k) => k.kind);
      expect([...new Set(kinds)].sort()).toEqual(["true_up_invoiced", "true_up_paid", "true_up_questioned", "true_up_report"]);
    });
  });
});
