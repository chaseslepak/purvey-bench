"use client";

import { useActionState, useState } from "react";
import { signUp, type AuthFormState } from "@/app/auth/actions";
import { Turnstile, useTurnstileReady } from "@/components/ui/Turnstile";

export function SignUpForm({ initialRole, turnstileSiteKey, next }: { initialRole?: "brand" | "broker"; turnstileSiteKey: string; next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, undefined);
  const ts = useTurnstileReady(turnstileSiteKey);
  const [role, setRole] = useState<"brand" | "broker" | undefined>(initialRole);
  const err = (k: string) => state?.fieldErrors?.[k];
  const described = (k: string) => (err(k) ? `${k}-error` : undefined);

  return (
    <form action={action} className="bench-form" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset className="bench-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="bench-label" style={{ marginBottom: 8 }}>I am a…</legend>
        <div className="bench-choice-group">
          <label className="bench-choice">
            <input type="radio" name="role" value="brand" checked={role === "brand"} onChange={() => setRole("brand")} />
            <span className="bench-choice_title">Brand</span>
            <span className="bench-small bench-muted" style={{ display: "block", marginTop: 4 }}>
              Find and message brokers. Always free.
            </span>
          </label>
          <label className="bench-choice">
            <input type="radio" name="role" value="broker" checked={role === "broker"} onChange={() => setRole("broker")} />
            <span className="bench-choice_title">Broker</span>
            <span className="bench-small bench-muted" style={{ display: "block", marginTop: 4 }}>
              List your brokerage for $100 a month, or $300 a year paid up front (75% off).
            </span>
          </label>
        </div>
        {err("role") && <p id="role-error" className="bench-error">{err("role")}</p>}
      </fieldset>

      <div className="bench-grid-2">
        <div className="bench-field">
          <label htmlFor="name" className="bench-label">Your name</label>
          <input id="name" name="name" autoComplete="name" required className="bench-input" aria-invalid={Boolean(err("name"))} aria-describedby={described("name")} />
          {err("name") && <p id="name-error" className="bench-error">{err("name")}</p>}
        </div>
        <div className="bench-field">
          <label htmlFor="jobTitle" className="bench-label">Your role <span className="bench-muted">(optional)</span></label>
          <input id="jobTitle" name="jobTitle" autoComplete="organization-title" className="bench-input" />
        </div>
      </div>

      <div className="bench-field">
        <label htmlFor="orgName" className="bench-label">{role === "broker" ? "Brokerage name" : "Brand name"}</label>
        <input id="orgName" name="orgName" autoComplete="organization" required className="bench-input" aria-invalid={Boolean(err("orgName"))} aria-describedby={described("orgName")} />
        {err("orgName") && <p id="orgName-error" className="bench-error">{err("orgName")}</p>}
      </div>

      <div className="bench-field">
        <label htmlFor="email" className="bench-label">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="bench-input" aria-invalid={Boolean(err("email"))} aria-describedby={described("email")} />
        {err("email") && <p id="email-error" className="bench-error">{err("email")}</p>}
      </div>

      <Turnstile siteKey={turnstileSiteKey} onToken={ts.onToken} />
      {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}

      <button type="submit" className="button bench-btn-block w-button" disabled={pending || !ts.ready}>
        {pending ? "Sending…" : role === "broker" ? "Create my account" : "Create my free account"}
      </button>
      <p className="bench-small bench-muted">
        We&rsquo;ll email you a link to finish signing up. By continuing you agree to the{" "}
        <a className="bench-link" href="/terms">Terms</a> and <a className="bench-link" href="/privacy">Privacy Policy</a>.
      </p>
    </form>
  );
}
