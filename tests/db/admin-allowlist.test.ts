import { afterAll, describe, expect, it } from "vitest";
import { as, closePool } from "./db";

afterAll(closePool);

describe("admin allowlist", () => {
  it("an allowlisted email is an admin on first sign-in; others are not; clients can't touch the list", async () => {
    await as({ role: "postgres" }, async (q) => {
      await q("insert into admin_allowlist (email) values ('boss@purvey.example')");
      await q("insert into auth.users (id, email) values ('00000000-0000-4000-a000-0000000000a1', 'Boss@Purvey.example'), ('00000000-0000-4000-a000-0000000000a2', 'someone@else.example')");
      const rows = await q<{ email: string; is_admin: boolean }>("select email, is_admin from public.users where id in ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a2') order by email");
      expect(rows.map((r) => r.is_admin)).toEqual([true, false]);
      // Adding an existing account's email promotes it at once.
      await q("insert into admin_allowlist (email) values ('someone@else.example')");
      const [r] = await q<{ is_admin: boolean }>("select is_admin from public.users where id = '00000000-0000-4000-a000-0000000000a2'");
      expect(r.is_admin).toBe(true);
    });
    await expect(as({ role: "authenticated", sub: "00000000-0000-4000-a000-000000000001" }, (q) => q("insert into admin_allowlist (email) values ('me@x.example')"))).rejects.toThrow(/permission denied/);
  });
});
