"use client";

import { useState } from "react";

/** A read-only block of template text with a Copy button. */
export function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bench-stack" style={{ gap: 8 }}>
      <pre className="bench-copyblock" tabIndex={0} aria-label={label}>{text}</pre>
      <div className="bench-row">
        <button type="button" className="button bench-btn-ghost is-small w-button"
          onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); } }}>
          {copied ? "Copied" : `Copy the ${label}`}
        </button>
        <span className="bench-save" role="status" aria-live="polite">{copied ? "Copied to your clipboard" : ""}</span>
      </div>
    </div>
  );
}
