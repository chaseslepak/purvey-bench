"use client";

import { useState } from "react";

/** On small screens the filters collapse behind a "Filters (n)" toggle so results come first. */
export function FilterPanel({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="bench-find_toggle" aria-expanded={open} aria-controls="find-filters" onClick={() => setOpen((o) => !o)}>
        <span>Filters{active ? ` (${active})` : ""}</span><span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id="find-filters" className={`bench-find_body bench-stack${open ? " is-open" : ""}`} style={{ gap: 14 }}>{children}</div>
    </>
  );
}
