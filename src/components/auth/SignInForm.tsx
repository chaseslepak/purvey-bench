"use client";

import { useActionState } from "react";
import { sendSignInLink, type AuthFormState } from "@/app/auth/actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(sendSignInLink, undefined);
  return (
    <form action={action} className="bench-form" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <div className="bench-field">
        <label htmlFor="email" className="bench-label">Work email</label>
        <input
          id="email" name="email" type="email" autoComplete="email" required className="bench-input"
          aria-invalid={Boolean(state?.fieldErrors?.email)} aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined}
        />
        {state?.fieldErrors?.email && <p id="email-error" className="bench-error">{state.fieldErrors.email}</p>}
      </div>
      {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}
      <button type="submit" className="button bench-btn-block w-button" disabled={pending}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
