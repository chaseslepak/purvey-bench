import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type OrgType = "brand" | "broker";
export type SessionContext = {
  userId: string;
  email: string;
  name: string | null;
  role: OrgType | null;
  isAdmin: boolean;
  metadata: Record<string, unknown>;
  org: { id: string; type: OrgType; name: string; slug: string; memberRole: "owner" | "member" } | null;
};

/** The signed-in user, their profile and organization. Cached per request. */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  await cookies(); // always render per request, whatever the environment
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("users").select("name, role, is_admin").eq("id", auth.user.id).maybeSingle(),
    supabase
      .from("org_members")
      .select("role, organizations(id, type, name, slug)")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const org = membership?.organizations as unknown as { id: string; type: OrgType; name: string; slug: string } | null;
  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    name: profile?.name ?? null,
    role: (profile?.role as OrgType | null) ?? null,
    isAdmin: Boolean(profile?.is_admin),
    metadata: auth.user.user_metadata ?? {},
    org: org ? { ...org, memberRole: membership!.role as "owner" | "member" } : null,
  };
});
