import { execSync } from "node:child_process";
import pg from "pg";
import { U, type Fixture } from "./fixtures";
import { DATABASE_URL } from "./db";

/**
 * Rebuild the local test database from the migrations and seed, then create
 * a committed fixture: two brands, a live brokerage (comped), a draft
 * brokerage, an admin, a brief and a conversation.
 */
export default async function setup() {
  if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL)) throw new Error("DB tests only run against a local database");
  const env = { ...process.env, DATABASE_URL };
  execSync("bash scripts/migrate.sh --reset && bash scripts/seed.sh", { env, stdio: "pipe" });

  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  const asUid = async (uid: string, sql: string, params: unknown[] = []) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const r = await c.query(sql, params);
    await c.query("select set_config('request.jwt.claims', '', false)");
    return r.rows;
  };
  const id = async (sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0].id as string;

  for (const [name, uid] of Object.entries(U)) {
    await c.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      uid, `${name}@example.test`, JSON.stringify({ name }),
    ]);
  }
  await c.query("update public.users set is_admin = true where id = $1", [U.pat]);

  const brandA = (await asUid(U.alice, "select (public.create_organization('brand', 'Acme Snacks')).id"))[0].id;
  const brandB = (await asUid(U.bob, "select (public.create_organization('brand', 'Bobs Beverages')).id"))[0].id;
  const brokerX = (await asUid(U.xavier, "select (public.create_organization('broker', 'Lakeshore Sales', 'https://lakeshore.example', 'Chicago', 'IL')).id"))[0].id;
  const brokerY = (await asUid(U.yolanda, "select (public.create_organization('broker', 'Yellow Pine Brokerage')).id"))[0].id;

  // Teammates join through invites.
  const tokA = (await asUid(U.alice, "select public.create_invite('amy@example.test') as t"))[0].t;
  await asUid(U.amy, "select public.accept_invite($1)", [tokA]);
  const tokX = (await asUid(U.xavier, "select public.create_invite('xena@example.test') as t"))[0].t;
  await asUid(U.xena, "select public.accept_invite($1)", [tokX]);

  const listingX = await id("select id from public.broker_listings where org_id = $1", [brokerX]);
  const listingY = await id("select id from public.broker_listings where org_id = $1", [brokerY]);
  const ref = async (table: string, slug: string) => (await c.query(`select id from public.${table} where slug = $1`, [slug])).rows[0].id as number;

  // Broker X fills in a listing and is comped live by the admin.
  await asUid(U.xavier, `update public.broker_listings set about = 'Midwest natural and conventional grocery brokerage covering Kroger and Meijer.',
      channels = $2, distributors = $3, categories = $4, conflicts = $5, commission_model = 'pct_net_sales',
      rate_low = 3, rate_high = 5, min_term_months = 12, years_in_business = 12, team_size = 9 where id = $1`,
    [listingX, [await ref("channels", "conventional-grocery")], [await ref("distributors", "unfi")],
     [await ref("categories", "salty-snacks")], [await ref("categories", "meat-snacks")]]);
  await asUid(U.xavier, "update public.broker_contacts set name = 'Xavier Lake', title = 'Principal', email = 'xavier@lakeshore.example', phone = '312-555-0100' where listing_id = $1", [listingX]);
  await asUid(U.xavier, "insert into public.broker_states (listing_id, state_code) values ($1,'IL'),($1,'IN'),($1,'MI')", [listingX]);
  await asUid(U.xavier, `insert into public.broker_retailers (listing_id, retailer_id, call_frequency) values
      ($1, $2, 'weekly'), ($1, $3, 'monthly'), ($1, $4, 'occasional')`,
    [listingX, await ref("retailers", "kroger"), await ref("retailers", "meijer"), await ref("retailers", "jewel-osco")]);
  await asUid(U.xavier, "insert into public.broker_references (listing_id, name, brand, email) values ($1, 'Ref One', 'Brand One', 'r1@example.test'), ($1, 'Ref Two', 'Brand Two', 'r2@example.test')", [listingX]);
  await asUid(U.xavier, "select public.submit_listing()");
  await asUid(U.pat, "select public.admin_set_comp($1, true)", [brokerX]);

  const briefA = (await asUid(U.alice, `insert into public.briefs (brand_org_id, title, states, created_by)
      values ($1, 'Midwest jerky launch', '{IL,OH}', $2) returning id`, [brandA, U.alice]))[0].id;
  const convAX = (await asUid(U.alice, `insert into public.conversations (brand_org_id, broker_org_id, started_by, brief_id)
      values ($1, $2, $3, $4) returning id`, [brandA, brokerX, U.alice, briefA]))[0].id;
  await asUid(U.alice, "insert into public.messages (conversation_id, sender_user_id, sender_org_id, body) values ($1, $2, $3, 'Hi Lakeshore, interested in Kroger Midwest?')",
    [convAX, U.alice, brandA]);

  const fixture: Fixture = { brandA, brandB, brokerX, brokerY, listingX, listingY, briefA, convAX };
  await c.query("create table public.__test_fixture (value jsonb)");
  await c.query("insert into public.__test_fixture values ($1)", [JSON.stringify(fixture)]);
  await c.end();
}
