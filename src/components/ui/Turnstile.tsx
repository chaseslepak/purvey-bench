"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
    __benchTurnstileLoaded?: Promise<void>;
  }
}

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__benchTurnstileLoaded ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(s);
  });
  return window.__benchTurnstileLoaded;
}

/**
 * Cloudflare Turnstile, rendered explicitly so the form knows when the check
 * has passed (`onToken`). Posts the token as `cf-turnstile-response`.
 * Renders nothing without a site key (local development).
 */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken?: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; });

  useEffect(() => {
    if (!siteKey) return;
    let id: string | null = null;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: "light",
        "response-field": false,
        callback: (t: string) => { setToken(t); cb.current?.(t); },
        "expired-callback": () => { setToken(""); cb.current?.(null); },
        "error-callback": () => { setToken(""); cb.current?.(null); },
      });
    }).catch(() => cb.current?.(null));
    return () => { cancelled = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <>
      <div ref={ref} className="bench-turnstile" />
      <input type="hidden" name="cf-turnstile-response" value={token} />
    </>
  );
}

/** True when a form can submit: no site key configured, or the check passed. */
export function useTurnstileReady(siteKey: string) {
  const [token, setToken] = useState<string | null>(null);
  return { ready: !siteKey || Boolean(token), token, onToken: setToken };
}
