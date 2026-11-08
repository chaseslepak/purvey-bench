import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Every /app page needs a session; people without an organization finish onboarding first. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/app");
  const path = (await headers()).get("x-pathname") ?? "";
  if (!session.org && !path.startsWith("/app/onboarding")) redirect("/app/onboarding");
  return <>{children}</>;
}
