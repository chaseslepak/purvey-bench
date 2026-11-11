"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleSave } from "@/app/find/actions";

export function SaveButton({ listingId, name, initial, signedIn, isBrand, next }: { listingId: string; name: string; initial: boolean; signedIn: boolean; isBrand: boolean; next: string }) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!signedIn) return <Link className="button bench-btn-ghost is-small w-button" href={`/sign-up?role=brand&next=${encodeURIComponent(next)}`}>Save</Link>;
  if (!isBrand) return null;
  return (
    <>
      <button type="button" className="button bench-btn-ghost is-small w-button" aria-pressed={saved} disabled={pending}
        aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
        onClick={() => start(async () => { const r = await toggleSave(listingId); if (r.error) setMsg(r.error); else setSaved(Boolean(r.saved)); })}>
        {saved ? "Saved" : "Save"}
      </button>
      {msg && <span className="bench-error" role="alert">{msg}</span>}
    </>
  );
}
