"use client";

import { useState, useTransition } from "react";
import { openBillingPortal } from "./actions";

export function PortalButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="bench-stack" style={{ gap: 8 }}>
      <button type="button" className="button w-button" disabled={pending} style={{ width: "fit-content" }}
        onClick={() => start(async () => {
          const r = await openBillingPortal();
          if (r.url) (window.top ?? window).location.href = r.url; // top level, never inside the iframe
          else setError(r.error ?? "Couldn't open billing.");
        })}>
        {pending ? "Opening…" : "Update card, invoices or cancel"}
      </button>
      {error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
