"use client";

import { useEffect, useState } from "react";

/** Compare is enabled for 2 or 3 ticked brokers; the count is shown as you tick. */
export function CompareSubmit({ form }: { form: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(document.querySelectorAll(`input[form="${form}"][name="ids"]:checked`).length);
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [form]);
  const hint = n === 0 ? "Tick two or three brokers to compare." : n === 1 ? "Tick one or two more." : n > 3 ? `Untick ${n - 3} — compare up to three.` : `${n} selected.`;
  return (
    <div className="bench-row">
      <span className="bench-small bench-muted" role="status" aria-live="polite">{hint}</span>
      <button type="submit" form={form} className="button is-small w-button" disabled={n < 2 || n > 3}>Compare selected</button>
    </div>
  );
}
