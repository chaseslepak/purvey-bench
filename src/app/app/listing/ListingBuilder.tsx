"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ListingCard } from "@/components/listing/ListingCard";
import { UsTileMap } from "@/components/listing/UsTileMap";
import { coverageSummary, FREQ_LABEL, topRetailers, type Freq } from "@/lib/coverage";
import { createClient } from "@/lib/supabase/browser";
import {
  attachDocument, attachLogo, deleteDocument, documentLink, requestVerification, saveStep, setDocumentPrivacy, publishListing,
  type ChecklistItem, type DocRow, type SaveResult, type StepName,
} from "./actions";

type Ref = { id: number; name: string };
export type BuilderInitial = {
  listingId: string;
  orgId: string;
  isOwner: boolean;
  displayState: string;
  verified: boolean;
  verification: { status: string; reason: string | null } | null;
  checklist: ChecklistItem[];
  company: { name: string; website: string; hqCity: string; hqState: string; about: string; contactName: string; contactTitle: string; contactEmail: string; contactPhone: string; logoUrl: string | null };
  coverage: { states: string[]; channels: number[]; distributors: number[] };
  retailers: { retailerId: number | null; customName: string | null; name: string; freq: Freq }[];
  categories: { categories: number[]; conflicts: number[]; currentLines: string };
  terms: { model: string; rateLow: string; rateHigh: string; retainer: string; minTerm: string };
  proof: { years: string; teamSize: string; merchandisers: string; references: { name: string; brand: string; email: string; phone: string }[] };
  documents: DocRow[];
  notTakingNewLines: boolean;
};
type RefData = {
  regions: { code: string; name: string }[];
  states: { code: string; name: string; region_code: string }[];
  retailers: Ref[]; channels: Ref[]; distributors: Ref[]; categories: Ref[];
};

const STEPS: { key: StepName; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "coverage", label: "Coverage" },
  { key: "retailers", label: "Retailers" },
  { key: "categories", label: "Categories" },
  { key: "terms", label: "Terms" },
  { key: "proof", label: "Proof" },
];

type Status = { kind: "idle" | "saving" | "saved" | "error"; message?: string };

/** Debounced autosave per step. Returns a status for the "Saved" indicator. */
function useAutosave<T>(step: StepName, value: T, onSaved: (r: SaveResult) => void, map: (v: T) => unknown = (v) => v) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const first = useRef(true);
  const latest = useRef(value);
  useEffect(() => { latest.current = value; });
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus({ kind: "saving" });
    const t = setTimeout(async () => {
      try {
        const r = await saveStep(step, map(latest.current));
        onSaved(r);
        setStatus(r.ok ? { kind: "saved" } : { kind: "error", message: r.error });
      } catch {
        setStatus({ kind: "error", message: "Couldn't save. Check your connection." });
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save when the value changes
  }, [JSON.stringify(value)]);
  return status;
}

function Chips({ options, selected, onChange, label }: { options: Ref[]; selected: number[]; onChange: (v: number[]) => void; label: string }) {
  const set = new Set(selected);
  return (
    <div className="bench-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="bench-chip" aria-pressed={set.has(o.id)}
          onClick={() => onChange(set.has(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id])}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bench-field">
      <label htmlFor={id} className="bench-label">{label}</label>
      {children}
      {hint && <p className="bench-hint" style={{ margin: 0 }}>{hint}</p>}
    </div>
  );
}

const STATE_COPY: Record<string, { label: string; help: string; tone: string }> = {
  draft: { label: "Draft", help: "Brands can't see your listing yet. Finish the steps, then publish it.", tone: "" },
  submitted: { label: "Submitted", help: "Your listing is ready. Publish it to go live.", tone: "is-mist" },
  live: { label: "Live", help: "Brands can find and message you.", tone: "is-blue" },
  paused_billing: { label: "Paused for billing", help: "Your last payment didn't go through. Update your card in Billing and your listing goes live again automatically.", tone: "" },
  paused_admin: { label: "Paused by Purvey", help: "Purvey has paused your listing. Reply to our email or contact us to resolve it.", tone: "" },
};

export function ListingBuilder({ initial, refs, banner }: { initial: BuilderInitial; refs: RefData; banner: string | null }) {
  const [step, setStep] = useState(0);
  const [checklist, setChecklist] = useState(initial.checklist);
  const completeness = checklist.length ? Math.round((100 * checklist.filter((c) => c.done).length) / checklist.length) : 0;
  const onSaved = useCallback((r: SaveResult) => { if (r.ok) setChecklist(r.checklist); }, []);

  const [company, setCompany] = useState(initial.company);
  const [coverage, setCoverage] = useState(initial.coverage);
  const [retailers, setRetailers] = useState(initial.retailers);
  const [categories, setCategories] = useState(initial.categories);
  const [terms, setTerms] = useState(initial.terms);
  const [proof, setProof] = useState(initial.proof);
  const [docs, setDocs] = useState(initial.documents);

  const { logoUrl, ...companyFields } = company;
  const statusByStep: Record<StepName, Status> = {
    company: useAutosave("company", companyFields, onSaved),
    coverage: useAutosave("coverage", coverage, onSaved),
    retailers: useAutosave("retailers", retailers, onSaved, (rs) => ({ rows: rs.map((r) => r.retailerId ? { retailerId: r.retailerId, freq: r.freq } : { customName: r.customName, freq: r.freq }) })),
    categories: useAutosave("categories", categories, onSaved),
    terms: useAutosave("terms", terms, onSaved),
    proof: useAutosave("proof", proof, onSaved),
  };

  const stateNames = useMemo(() => Object.fromEntries(refs.states.map((s) => [s.code, s.name])), [refs.states]);
  const nameOf = (list: Ref[], ids: number[]) => ids.map((i) => list.find((x) => x.id === i)?.name).filter(Boolean) as string[];
  const preview = {
    name: company.name,
    logoUrl,
    hq: [company.hqCity, company.hqState].filter(Boolean).join(", ") || null,
    coverage: coverageSummary(coverage.states, refs.states, refs.regions),
    channels: nameOf(refs.channels, coverage.channels),
    retailers: topRetailers(retailers.map((r) => ({ name: r.name, freq: r.freq }))),
    verified: initial.verified,
    notTakingNewLines: initial.notTakingNewLines,
  };

  const current = STEPS[step].key;
  const st = statusByStep[current];
  const missing = checklist.filter((c) => !c.done);
  const state = STATE_COPY[initial.displayState] ?? STATE_COPY.draft;
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  function submit() {
    setSubmitError(null);
    startSubmit(async () => {
      const r = await publishListing();
      if (!r.ok) return setSubmitError(r.error);
      window.location.reload();
    });
  }

  return (
    <div className="bench-builder">
      <section className="bench-section is-cream bench-stack" aria-labelledby="listing-h">
        <div className="bench-row" style={{ justifyContent: "space-between" }}>
          <div className="text_title">Your listing</div>
          <span className={`bench-tag ${state.tone}`}>{state.label}</span>
        </div>
        <h1 id="listing-h" className="bench-h-section">{company.name || "Your brokerage"}</h1>
        <p className="bench-lede" style={{ margin: 0 }}>{state.help}</p>
        {banner && <p className="bench-notice" role="status" style={{ margin: 0 }}>{banner}</p>}
      </section>

      <div className="bench-builder_grid">
        <section className="bench-section bench-stack" aria-labelledby="step-h">
          <nav aria-label="Listing steps">
            <ol className="bench-stepper">
              {STEPS.map((s, i) => {
                const left = checklist.filter((c) => c.step === i + 1 && !c.done).length;
                return (
                  <li key={s.key}>
                    <button type="button" aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
                      <span className="bench-stepper_n">{i + 1}</span> {s.label}
                      {left === 0 ? <span className="bench-sr-only"> (complete)</span> : <span className="bench-sr-only"> ({left} to do)</span>}
                      <span className={`bench-stepper_dot${left === 0 ? " is-done" : ""}`} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="bench-progress" aria-hidden="true"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          </nav>

          <div className="bench-row" style={{ justifyContent: "space-between" }}>
            <h2 id="step-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>{step + 1}. {STEPS[step].label}</h2>
            <span className={`bench-save is-${st.kind}`} role="status" aria-live="polite">
              {st.kind === "saving" ? "Saving…" : st.kind === "saved" ? "Saved" : st.kind === "error" ? st.message : ""}
            </span>
          </div>

          {current === "company" && (
            <CompanyStep company={company} setCompany={setCompany} states={refs.states} orgId={initial.orgId} onSaved={onSaved} />
          )}
          {current === "coverage" && (
            <div className="bench-stack">
              <div className="bench-row" role="group" aria-label="Region shortcuts">
                {refs.regions.map((r) => {
                  const codes = refs.states.filter((s) => s.region_code === r.code).map((s) => s.code);
                  const all = codes.every((c) => coverage.states.includes(c));
                  return (
                    <button key={r.code} type="button" className="bench-chip" aria-pressed={all}
                      onClick={() => setCoverage((c) => ({ ...c, states: all ? c.states.filter((s) => !codes.includes(s)) : [...new Set([...c.states, ...codes])] }))}>
                      {r.name}
                    </button>
                  );
                })}
                <button type="button" className="bench-chip" aria-pressed={coverage.states.length === refs.states.length}
                  onClick={() => setCoverage((c) => ({ ...c, states: c.states.length === refs.states.length ? [] : refs.states.map((s) => s.code) }))}>
                  National
                </button>
              </div>
              <UsTileMap selected={new Set(coverage.states)} names={stateNames}
                onToggle={(code) => setCoverage((c) => ({ ...c, states: c.states.includes(code) ? c.states.filter((s) => s !== code) : [...c.states, code] }))} />
              <p className="bench-hint" style={{ margin: 0 }}>{coverage.states.length} states · {preview.coverage}</p>
              <h3 className="bench-label">Channels</h3>
              <Chips label="Channels" options={refs.channels} selected={coverage.channels} onChange={(v) => setCoverage((c) => ({ ...c, channels: v }))} />
              <h3 className="bench-label">Distributors you work with</h3>
              <Chips label="Distributors" options={refs.distributors} selected={coverage.distributors} onChange={(v) => setCoverage((c) => ({ ...c, distributors: v }))} />
            </div>
          )}
          {current === "retailers" && <RetailersStep rows={retailers} setRows={setRetailers} options={refs.retailers} />}
          {current === "categories" && (
            <div className="bench-stack">
              <h3 className="bench-label">Categories you sell</h3>
              <Chips label="Categories you sell" options={refs.categories} selected={categories.categories} onChange={(v) => setCategories((c) => ({ ...c, categories: v }))} />
              <h3 className="bench-label">Categories you can&rsquo;t take on (conflicts)</h3>
              <p className="bench-hint" style={{ margin: 0 }}>Brands in these categories see a conflict warning on your card.</p>
              <Chips label="Conflicts" options={refs.categories} selected={categories.conflicts} onChange={(v) => setCategories((c) => ({ ...c, conflicts: v }))} />
              <Field id="current-lines" label="Current lines carried" hint="One per line, e.g. Kettle chips · Midwest">
                <textarea id="current-lines" className="bench-input" value={categories.currentLines} maxLength={2000}
                  onChange={(e) => setCategories((c) => ({ ...c, currentLines: e.target.value }))} />
              </Field>
            </div>
          )}
          {current === "terms" && (
            <div className="bench-stack">
              <fieldset className="bench-field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="bench-label" style={{ marginBottom: 8 }}>Commission model</legend>
                <div className="bench-choice-group" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  {[["pct_net_sales", "% of net sales"], ["retainer_plus_pct", "Retainer + %"], ["retainer_only", "Retainer only"]].map(([v, l]) => (
                    <label key={v} className="bench-choice">
                      <input type="radio" name="model" value={v} checked={terms.model === v} onChange={() => setTerms((t) => ({ ...t, model: v }))} />
                      <span style={{ fontWeight: 500 }}>{l}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {terms.model !== "retainer_only" && (
                <div className="bench-grid-2">
                  <Field id="rate-low" label="Rate from (%)"><input id="rate-low" className="bench-input" inputMode="decimal" value={terms.rateLow} onChange={(e) => setTerms((t) => ({ ...t, rateLow: e.target.value }))} /></Field>
                  <Field id="rate-high" label="Rate to (%)"><input id="rate-high" className="bench-input" inputMode="decimal" value={terms.rateHigh} onChange={(e) => setTerms((t) => ({ ...t, rateHigh: e.target.value }))} /></Field>
                </div>
              )}
              <div className="bench-grid-2">
                {terms.model !== "pct_net_sales" && (
                  <Field id="retainer" label="Monthly retainer ($)"><input id="retainer" className="bench-input" inputMode="numeric" value={terms.retainer} onChange={(e) => setTerms((t) => ({ ...t, retainer: e.target.value }))} /></Field>
                )}
                <Field id="min-term" label="Minimum term (months)"><input id="min-term" className="bench-input" inputMode="numeric" value={terms.minTerm} onChange={(e) => setTerms((t) => ({ ...t, minTerm: e.target.value }))} /></Field>
              </div>
            </div>
          )}
          {current === "proof" && (
            <ProofStep proof={proof} setProof={setProof} docs={docs} setDocs={setDocs} listingId={initial.listingId} onSaved={onSaved} />
          )}

          <div className="bench-row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <button type="button" className="button bench-btn-ghost w-button" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="button w-button" onClick={() => setStep((s) => s + 1)}>Next: {STEPS[step + 1].label}</button>
            ) : null}
          </div>
        </section>

        <aside className="bench-stack bench-builder_side">
          <div className="bench-stack">
            <div className="bench-eyebrow">Preview: what brands see</div>
            <ListingCard data={preview} />
          </div>

          <div className="bench-card is-white bench-stack">
            <div className="bench-row" style={{ justifyContent: "space-between" }}>
              <h2 className="bench-eyebrow" style={{ margin: 0 }}>Profile strength</h2>
              <b className="bench-h-section" style={{ fontSize: "1.75rem" }}>{completeness}%</b>
            </div>
            <div className="bench-progress" role="progressbar" aria-valuenow={completeness} aria-valuemin={0} aria-valuemax={100} aria-label="Profile strength">
              <span style={{ width: `${completeness}%` }} />
            </div>
            {missing.length === 0 ? (
              <p className="bench-small" style={{ margin: 0 }}>Everything&rsquo;s filled in.</p>
            ) : (
              <ul className="bench-todo">
                {missing.slice(0, 6).map((m) => (
                  <li key={m.key}><button type="button" className="bench-link-btn" onClick={() => setStep(m.step - 1)}>{m.label}</button></li>
                ))}
                {missing.length > 6 && <li className="bench-muted">and {missing.length - 6} more</li>}
              </ul>
            )}
            {initial.verified ? (
              <p className="bench-notice" style={{ margin: 0 }}>Verified by Purvey.</p>
            ) : initial.verification?.status === "requested" ? (
              <p className="bench-notice" style={{ margin: 0 }}>Verification requested. Purvey will contact your references.</p>
            ) : (
              <>
                {initial.verification?.status === "rejected" && initial.verification.reason && (
                  <p className="bench-notice is-warn" style={{ margin: 0 }}>Last request wasn&rsquo;t approved: {initial.verification.reason}</p>
                )}
                <button type="button" className="button bench-btn-ghost w-button" disabled={completeness < 80 || !initial.isOwner}
                  onClick={async () => { const r = await requestVerification(); setVerifyMsg(r.ok ? "Request sent to Purvey." : r.error ?? null); }}>
                  Request verification
                </button>
                <p className="bench-hint" style={{ margin: 0 }}>{verifyMsg ?? (completeness < 80 ? "Available at 80% profile strength." : !initial.isOwner ? "An owner can request verification." : "Purvey checks your references and two retailer relationships.")}</p>
              </>
            )}
          </div>

          {(initial.displayState === "draft" || initial.displayState === "submitted") && (
            <div className="bench-card bench-stack">
              <h2 className="bench-eyebrow" style={{ margin: 0 }}>Go live</h2>
              <p className="bench-small" style={{ margin: 0 }}>Your plan is paid. Publish once you have a description, a public contact, your states and at least three retailers.</p>
              {initial.isOwner ? (
                <button type="button" className="button bench-btn-block w-button" onClick={submit} disabled={submitting}>
                  {submitting ? "Publishing…" : "Publish listing"}
                </button>
              ) : (
                <p className="bench-small bench-muted" style={{ margin: 0 }}>An owner on your team can publish the listing.</p>
              )}
              {submitError && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{submitError}</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function CompanyStep({ company, setCompany, states, orgId, onSaved }: {
  company: BuilderInitial["company"]; setCompany: React.Dispatch<React.SetStateAction<BuilderInitial["company"]>>;
  states: RefData["states"]; orgId: string; onSaved: (r: SaveResult) => void;
}) {
  const set = (k: keyof BuilderInitial["company"]) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setCompany((c) => ({ ...c, [k]: e.target.value }));
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  async function uploadLogo(file: File) {
    setLogoMsg("Uploading…");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/jpeg" ? "jpg" : null;
    if (!ext || file.size > 2 * 1024 * 1024) return setLogoMsg("Use a PNG, JPG or WebP image under 2 MB.");
    const path = `${orgId}/logo-${Date.now()}.${ext}`;
    const { error } = await createClient().storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
    if (error) return setLogoMsg("Upload failed. Try again.");
    const r = await attachLogo(path);
    onSaved(r);
    if (r.ok && r.logoUrl) { setCompany((c) => ({ ...c, logoUrl: r.logoUrl! })); setLogoMsg("Logo updated."); } else setLogoMsg(r.ok ? null : r.error);
  }
  return (
    <div className="bench-stack">
      <div className="bench-grid-2">
        <Field id="org-name" label="Brokerage name"><input id="org-name" className="bench-input" value={company.name} maxLength={120} onChange={set("name")} /></Field>
        <Field id="website" label="Website"><input id="website" className="bench-input" inputMode="url" placeholder="https://" value={company.website} onChange={set("website")} /></Field>
        <Field id="hq-city" label="HQ city"><input id="hq-city" className="bench-input" value={company.hqCity} onChange={set("hqCity")} /></Field>
        <Field id="hq-state" label="HQ state">
          <select id="hq-state" className="bench-input" value={company.hqState} onChange={set("hqState")}>
            <option value="">Choose…</option>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field id="logo" label="Logo" hint={logoMsg ?? "PNG, JPG or WebP, up to 2 MB. A square logo works best."}>
        <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" className="bench-input" style={{ paddingTop: 14 }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ""; }} />
      </Field>
      <Field id="about" label="About" hint={`${company.about.length}/500 characters. What you sell, where, and to whom.`}>
        <textarea id="about" className="bench-input" value={company.about} maxLength={500} onChange={set("about")} />
      </Field>
      <h3 className="bench-label" style={{ marginTop: 8 }}>Public contact (shown to signed-in brands)</h3>
      <div className="bench-grid-2">
        <Field id="c-name" label="Name"><input id="c-name" className="bench-input" autoComplete="name" value={company.contactName} onChange={set("contactName")} /></Field>
        <Field id="c-title" label="Title"><input id="c-title" className="bench-input" value={company.contactTitle} onChange={set("contactTitle")} /></Field>
        <Field id="c-email" label="Email"><input id="c-email" type="email" className="bench-input" autoComplete="email" value={company.contactEmail} onChange={set("contactEmail")} /></Field>
        <Field id="c-phone" label="Phone"><input id="c-phone" type="tel" className="bench-input" autoComplete="tel" value={company.contactPhone} onChange={set("contactPhone")} /></Field>
      </div>
    </div>
  );
}

function RetailersStep({ rows, setRows, options }: { rows: BuilderInitial["retailers"]; setRows: React.Dispatch<React.SetStateAction<BuilderInitial["retailers"]>>; options: Ref[] }) {
  const [q, setQ] = useState("");
  const [freq, setFreq] = useState<Freq>("weekly");
  const [msg, setMsg] = useState<string | null>(null);
  function add() {
    const name = q.trim();
    if (!name) return;
    const match = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (rows.some((r) => r.name.toLowerCase() === (match?.name ?? name).toLowerCase())) return setMsg(`${match?.name ?? name} is already on your list.`);
    setRows((rs) => [...rs, match ? { retailerId: match.id, customName: null, name: match.name, freq } : { retailerId: null, customName: name, name, freq }]);
    setMsg(match ? null : `Added "${name}" as a custom retailer.`);
    setQ("");
  }
  return (
    <div className="bench-stack">
      <p className="bench-hint" style={{ margin: 0 }}>Add every retailer you call on and how often. Brands search by these, and you need at least three to submit.</p>
      <div className="bench-retailer-add">
        <Field id="retailer-q" label="Retailer">
          <input id="retailer-q" className="bench-input" list="retailer-options" value={q} placeholder="Start typing, e.g. Kroger"
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <datalist id="retailer-options">{options.map((o) => <option key={o.id} value={o.name} />)}</datalist>
        </Field>
        <Field id="retailer-freq" label="Call frequency">
          <select id="retailer-freq" className="bench-input" value={freq} onChange={(e) => setFreq(e.target.value as Freq)}>
            {(["weekly", "monthly", "occasional"] as Freq[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
          </select>
        </Field>
        <button type="button" className="button w-button" onClick={add}>Add</button>
      </div>
      {msg && <p className="bench-hint" role="status" style={{ margin: 0 }}>{msg}</p>}
      {rows.length > 0 ? (
        <div className="bench-table-wrap">
          <table className="bench-table">
            <thead><tr><th scope="col">Retailer</th><th scope="col">Call frequency</th><th scope="col"><span className="bench-sr-only">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td>{r.name}{!r.retailerId && <span className="bench-muted"> (custom)</span>}</td>
                  <td>
                    <label className="bench-sr-only" htmlFor={`freq-${i}`}>Call frequency for {r.name}</label>
                    <select id={`freq-${i}`} className="bench-input" style={{ minHeight: 40 }} value={r.freq}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, freq: e.target.value as Freq } : x)))}>
                      {(["weekly", "monthly", "occasional"] as Freq[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
                    </select>
                  </td>
                  <td><button type="button" className="bench-link-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.name}`}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="bench-notice" style={{ margin: 0 }}>No retailers yet. Add your weekly calls first; they count most in brands&rsquo; fit scores.</p>
      )}
      <p className="bench-hint" style={{ margin: 0 }}>{rows.length} retailer{rows.length === 1 ? "" : "s"}{rows.length < 3 ? ` · add ${3 - rows.length} more to submit` : ""}</p>
    </div>
  );
}

function ProofStep({ proof, setProof, docs, setDocs, listingId, onSaved }: {
  proof: BuilderInitial["proof"]; setProof: React.Dispatch<React.SetStateAction<BuilderInitial["proof"]>>;
  docs: DocRow[]; setDocs: React.Dispatch<React.SetStateAction<DocRow[]>>; listingId: string; onSaved: (r: SaveResult) => void;
}) {
  const refs = [0, 1].map((i) => proof.references[i] ?? { name: "", brand: "", email: "", phone: "" });
  const setRef = (i: number, k: string, v: string) => setProof((p) => ({ ...p, references: [0, 1].map((j) => (j === i ? { ...refs[j], [k]: v } : refs[j])) }));
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  async function uploadDoc(file: File) {
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) return setDocMsg("Upload a PDF of 10 MB or less.");
    setDocMsg("Uploading…");
    const path = `${listingId}/${crypto.randomUUID()}.pdf`;
    const { error } = await createClient().storage.from("listing-docs").upload(path, file, { contentType: "application/pdf" });
    if (error) return setDocMsg("Upload failed. Try again.");
    const r = await attachDocument(path, file.name, isPrivate);
    onSaved(r);
    if (r.ok && r.doc) { setDocs((d) => [...d, r.doc!]); setDocMsg(`${r.doc.file_name} added.`); } else setDocMsg(r.ok ? null : r.error);
  }
  return (
    <div className="bench-stack">
      <div className="bench-grid-3">
        <Field id="years" label="Years in business"><input id="years" className="bench-input" inputMode="numeric" value={proof.years} onChange={(e) => setProof((p) => ({ ...p, years: e.target.value }))} /></Field>
        <Field id="team" label="Team size"><input id="team" className="bench-input" inputMode="numeric" value={proof.teamSize} onChange={(e) => setProof((p) => ({ ...p, teamSize: e.target.value }))} /></Field>
        <Field id="merch" label="Retail merchandisers"><input id="merch" className="bench-input" inputMode="numeric" value={proof.merchandisers} onChange={(e) => setProof((p) => ({ ...p, merchandisers: e.target.value }))} /></Field>
      </div>
      <h3 className="bench-label" style={{ marginTop: 8 }}>Two brand references</h3>
      <p className="bench-hint" style={{ margin: 0 }}>Private. Only Purvey sees these, to verify your listing. Brands never do.</p>
      {refs.map((r, i) => (
        <fieldset key={i} className="bench-card is-white" style={{ border: 0, margin: 0 }}>
          <legend className="bench-eyebrow" style={{ float: "left", width: "100%", marginBottom: 12 }}>Reference {i + 1}</legend>
          <div className="bench-grid-2">
            <Field id={`r${i}-name`} label="Name"><input id={`r${i}-name`} className="bench-input" value={r.name} onChange={(e) => setRef(i, "name", e.target.value)} /></Field>
            <Field id={`r${i}-brand`} label="Brand"><input id={`r${i}-brand`} className="bench-input" value={r.brand} onChange={(e) => setRef(i, "brand", e.target.value)} /></Field>
            <Field id={`r${i}-email`} label="Email"><input id={`r${i}-email`} type="email" className="bench-input" value={r.email} onChange={(e) => setRef(i, "email", e.target.value)} /></Field>
            <Field id={`r${i}-phone`} label="Phone"><input id={`r${i}-phone`} type="tel" className="bench-input" value={r.phone} onChange={(e) => setRef(i, "phone", e.target.value)} /></Field>
          </div>
        </fieldset>
      ))}
      <h3 className="bench-label" style={{ marginTop: 8 }}>Documents</h3>
      <p className="bench-hint" style={{ margin: 0 }}>A line card or capabilities deck (PDF, up to 10 MB). Public documents appear on your profile; private ones only Purvey sees.</p>
      <div className="bench-row">
        <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Upload as private</label>
        <label className="button bench-btn-ghost w-button" style={{ position: "relative", cursor: "pointer" }}>
          Upload PDF
          <input type="file" accept="application/pdf" className="bench-sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); e.target.value = ""; }} />
        </label>
      </div>
      {docMsg && <p className="bench-hint" role="status" style={{ margin: 0 }}>{docMsg}</p>}
      {docs.length > 0 && (
        <ul className="bench-doclist">
          {docs.map((d) => (
            <li key={d.id}>
              <button type="button" className="bench-link-btn" onClick={async () => { const u = await documentLink(d.id); if (u) window.open(u, "_blank", "noopener"); }}>{d.file_name}</button>
              <span className="bench-muted bench-small">{(d.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
              <label className="bench-row bench-small" style={{ gap: 6 }}>
                <input type="checkbox" checked={d.is_private} onChange={async (e) => { const v = e.target.checked; const r = await setDocumentPrivacy(d.id, v); onSaved(r); if (r.ok) setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, is_private: v } : x))); }} /> Private
              </label>
              <button type="button" className="bench-link-btn" aria-label={`Delete ${d.file_name}`} onClick={async () => { const r = await deleteDocument(d.id); onSaved(r); if (r.ok) setDocs((ds) => ds.filter((x) => x.id !== d.id)); }}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
