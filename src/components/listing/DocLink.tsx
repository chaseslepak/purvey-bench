"use client";

import { documentLink } from "@/app/app/listing/actions";

/** Opens a short-lived signed link; access is checked by RLS on the server. */
export function DocLink({ id, name }: { id: string; name: string }) {
  return (
    <button type="button" className="bench-link-btn" onClick={async () => { const u = await documentLink(id); if (u) window.open(u, "_blank", "noopener"); }}>
      {name}
    </button>
  );
}
