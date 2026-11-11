import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandView } from "@/components/brand/BrandView";
import { loadBrand } from "@/lib/brand-data";
import { getReference } from "@/lib/reference";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brand profile preview", robots: { index: false } };

export default async function BrandPreview() {
  const session = await getSession();
  if (session?.org?.type !== "brand") redirect("/app");
  const db = await createClient();
  const [b, ref] = await Promise.all([loadBrand(db, session.org.id), getReference()]);
  if (!b) redirect("/app/brand");
  return (
    <>
      <section className="bench-section bench-stack" style={{ gap: 8 }}>
        <div className="text_title"><Link className="bench-link" href="/app/brand">Brand profile</Link> · preview</div>
        <h1 className="bench-h-section" style={{ margin: 0 }}>{b.org.name}</h1>
        <p className="bench-notice" style={{ margin: 0 }}>This is what a broker sees after you message them. Brands are never listed publicly.</p>
      </section>
      <BrandView b={b} refs={ref} />
    </>
  );
}
