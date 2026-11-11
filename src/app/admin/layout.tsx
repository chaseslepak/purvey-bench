import type { Metadata } from "next";
import { AdminTabs } from "./AdminTabs";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin | Purvey Bench" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <section className="bench-section is-cream bench-stack" style={{ gap: 8 }}>
        <div className="text_title">Purvey only</div>
        <h1 className="bench-h-section" style={{ margin: 0 }}>Bench admin</h1>
      </section>
      <AdminTabs />
      {children}
    </>
  );
}
