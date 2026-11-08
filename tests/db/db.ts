import pg from "pg";
import type { Fixture } from "./fixtures";

export const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres@localhost:54329/postgres";

let pool: pg.Pool | undefined;
export function getPool() {
  pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  return pool;
}
export async function closePool() {
  await pool?.end();
  pool = undefined;
}

export type Q = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;

type Who = { role: "anon" } | { role: "authenticated"; sub: string } | { role: "service_role" } | { role: "postgres" };

/**
 * Run `fn` inside a transaction as the given Supabase role and JWT subject,
 * then roll back. Mirrors how PostgREST executes a request.
 */
export async function as<T>(who: Who, fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const claims = who.role === "authenticated" ? { sub: who.sub, role: "authenticated" } : { role: who.role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    if (who.role !== "postgres") await client.query(`set local role ${who.role}`);
    // Each statement runs in a savepoint so an expected failure doesn't
    // abort the rest of the test's transaction.
    const q: Q = async (sql, params) => {
      await client.query("savepoint q");
      try {
        const res = await client.query(sql, params);
        await client.query("release savepoint q");
        return res.rows;
      } catch (e) {
        await client.query("rollback to savepoint q");
        throw e;
      }
    };
    return await fn(q);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

export const user = (sub: string): Who => ({ role: "authenticated", sub });
export const anon: Who = { role: "anon" };
export const service: Who = { role: "service_role" };
export const superuser: Who = { role: "postgres" };

export async function loadFixture(): Promise<Fixture> {
  const { rows } = await getPool().query("select value from public.__test_fixture limit 1");
  return rows[0].value as Fixture;
}
