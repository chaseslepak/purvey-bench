"use client";

import Script from "next/script";

/**
 * Cloudflare Turnstile widget. Renders nothing when no site key is set
 * (local development). The token is posted as `cf-turnstile-response`.
 */
export function Turnstile({ siteKey }: { siteKey: string }) {
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
    </>
  );
}
