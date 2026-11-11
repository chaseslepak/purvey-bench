/** target="_top" so Google opens at the top level even inside the purveycpg.com iframe. */
export function GoogleButton({ next, label = "Continue with Google" }: { next?: string; label?: string }) {
  const href = `/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <a href={href} target="_top" className="button bench-btn-ghost bench-btn-block w-button">
      {label}
    </a>
  );
}
