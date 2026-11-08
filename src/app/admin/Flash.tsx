/** Result notice after a form action redirects back with ?ok= or ?err=. */
export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <p className="bench-notice is-error" role="alert">{sp.err}</p>;
  if (sp.ok) return <p className="bench-notice" role="status">{sp.ok}</p>;
  return null;
}
export type FlashParams = Promise<{ ok?: string; err?: string; [k: string]: string | undefined }>;
