"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { sendSignInLink, signInWithPassword, type AuthFormState } from "@/app/auth/actions";

/** Sign in by emailed link (default) or with a password, for people who've set one. */
export function SignInForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [emailValue, setEmailValue] = useState(""); // kept across attempts and modes
  const [linkState, linkAction, linkPending] = useActionState<AuthFormState, FormData>(sendSignInLink, undefined);
  const [pwState, pwAction, pwPending] = useActionState<AuthFormState, FormData>(signInWithPassword, undefined);
  const state = mode === "link" ? linkState : pwState;
  const pending = mode === "link" ? linkPending : pwPending;
  const err = (k: string) => state?.fieldErrors?.[k];
  return (
    <div className="bench-stack" style={{ gap: 16 }}>
      <div className="bench-segmented" role="tablist" aria-label="How to sign in">
        <button type="button" role="tab" aria-selected={mode === "link"} onClick={() => setMode("link")}>Email me a link</button>
        <button type="button" role="tab" aria-selected={mode === "password"} onClick={() => setMode("password")}>Password</button>
      </div>
      <form action={mode === "link" ? linkAction : pwAction} className="bench-form" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
        <div className="bench-field">
          <label htmlFor="email" className="bench-label">Work email</label>
          <input id="email" name="email" type="email" autoComplete={mode === "password" ? "username" : "email"} required className="bench-input"
            value={emailValue} onChange={(e) => setEmailValue(e.target.value)}
            aria-invalid={Boolean(err("email"))} aria-describedby={err("email") ? "email-error" : undefined} />
          {err("email") && <p id="email-error" className="bench-error">{err("email")}</p>}
        </div>
        {mode === "password" && (
          <div className="bench-field">
            <div className="bench-row" style={{ justifyContent: "space-between" }}>
              <label htmlFor="password" className="bench-label">Password</label>
              <Link className="bench-link bench-small" href="/sign-in/reset">Forgot password?</Link>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="bench-input"
              aria-invalid={Boolean(err("password"))} aria-describedby={err("password") ? "password-error" : undefined} />
            {err("password") && <p id="password-error" className="bench-error">{err("password")}</p>}
          </div>
        )}
        {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}
        <button type="submit" className="button bench-btn-block w-button" disabled={pending}>
          {mode === "link" ? (pending ? "Sending…" : "Email me a sign-in link") : pending ? "Signing in…" : "Sign in"}
        </button>
        {mode === "password" && <p className="bench-small bench-muted" style={{ margin: 0 }}>No password yet? Use &ldquo;Email me a link&rdquo;, then add one in Settings.</p>}
      </form>
    </div>
  );
}
