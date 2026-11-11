"use client";

import { useState, useTransition } from "react";
import { openBrandFile } from "@/app/app/brand/actions";

/** Opens a data room file through a short-lived signed link. */
export function BrandFileLink({ id, name }: { id: string; name: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="bench-link-btn" disabled={pending} onClick={() => start(async () => {
        const r = await openBrandFile(id);
        if (r.url) window.open(r.url, "_blank", "noopener"); else setErr(r.error ?? "Couldn't open.");
      })}>{name}</button>
      {err && <span className="bench-small" role="alert"> {err}</span>}
    </>
  );
}
