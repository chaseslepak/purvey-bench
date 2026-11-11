import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Deal-room tabs are for after both sides agree to work together. */
export const DEAL_NOTE = "These tools are for after you've agreed to work together. You can set them up now if you like.";

/** True until this side has marked the deal as agreed (brand: agreement sent or signed; broker: won). */
export async function beforeAgreement(db: Db, conversationId: string, orgId: string, amBrand: boolean): Promise<boolean> {
  const { data } = await db.from("conversation_sides").select("brand_stage, broker_stage").eq("conversation_id", conversationId).eq("org_id", orgId).maybeSingle();
  const stage = amBrand ? data?.brand_stage : data?.broker_stage;
  return !(amBrand ? ["agreement_sent", "signed"] : ["won"]).includes(stage ?? "");
}
