"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteBrandFile, deleteProduct, openBrandFile, registerBrandFile, saveBrandProfile, saveCompany, saveProduct } from "./actions";
import { Chips, RefPicker, type Ref } from "@/components/pickers";
import { UsTileMap } from "@/components/listing/UsTileMap";
import {
  brandChecklist, CERTIFICATIONS, COMMISSION, completeness, DATA_ROOM_FOLDERS, REVENUE, STAGE, STORAGE, TIMELINE, TRADE,
  type BrandProfile, type Step,
} from "@/lib/brand-profile";
import { createClient } from "@/lib/supabase/browser";

export type Company = { name: string; website: string; hq_city: string; hq_state: string };
export type Product = { id: string; name: string; description: string | null; size: string | null; case_pack: number | null; msrp: number | null; wholesale: number | null; upc: string | null; shelf_life_days: number | null; storage: string | null };
export type DataFile = { id: string; name: string; folder: string; size: number; at: string };
type Refs = { regions: { code: string; name: string }[]; states: { code: string; name: string; region_code: string }[]; retailers: Ref[]; channels: Ref[]; distributors: Ref[]; categories: Ref[] };

const STEPS: [Step, string][] = [["company", "Company"], ["products", "Products"], ["today", "Where you sell"], ["goals", "Where you want to be"], ["dataroom", "Data room"]];
const opts = (list: readonly (readonly [string, string])[]) => list.map(([id, name]) => ({ id, name }));
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function Select({ id, label, value, options, onChange }: { id: string; label: string; value: string | null; options: readonly (readonly [string, string])[]; onChange: (v: string | null) => void }) {
  return (
    <div className="bench-field">
      <label htmlFor={id} className="bench-label">{label}</label>
      <select id={id} className="bench-input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Choose…</option>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </div>
  );
}

export function BrandBuilder({ orgId, isOwner, company: c0, profile: p0, products, files, refs, initialStep }: {
  orgId: string; isOwner: boolean; company: Company; profile: BrandProfile; products: Product[]; files: DataFile[]; refs: Refs; initialStep: Step;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [p, setP] = useState(p0);
  const [company, setCompany] = useState(c0);
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const first = useRef(true);
  const set = (patch: Partial<BrandProfile>) => setP((x) => ({ ...x, ...patch }));

  // Autosave the profile, 700 ms after the last change.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      setStatus("Saving…");
      const r = await saveBrandProfile(p);
      setStatus(r.ok ? "Saved" : r.error ?? "Couldn't save");
      if (r.ok) router.refresh();
    }, 700);
    return () => clearTimeout(t);
  }, [p, router]);

  const items = brandChecklist(p, { products: products.length, files: files.length, website: !!company.website.trim() });
  const pct = completeness(items);
  const names = Object.fromEntries(refs.states.map((s) => [s.code, s.name]));
  const toggleState = (key: "current_states" | "target_states", code: string) => set({ [key]: p[key].includes(code) ? p[key].filter((x) => x !== code) : [...p[key], code] } as Partial<BrandProfile>);

  return (
    <div className="bench-builder_grid">
      <div className="bench-stack" style={{ minWidth: 0 }}>
        <nav className="bench-tabs" aria-label="Brand profile steps">
          {STEPS.map(([k, l], i) => (
            <a key={k} href={`?step=${k}`} aria-current={step === k ? "page" : undefined} onClick={(e) => { e.preventDefault(); setStep(k); setMsg(null); history.replaceState(null, "", `?step=${k}`); }}>{i + 1}. {l}</a>
          ))}
        </nav>
        <div className="bench-row" style={{ justifyContent: "flex-end", minHeight: 20 }}><span className="bench-save" role="status" aria-live="polite">{status}</span></div>
        {msg?.error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
        {msg?.ok && <p className="bench-notice" role="status" style={{ margin: 0 }}>{msg.ok}</p>}

        {step === "company" && (
          <section className="bench-section bench-stack" aria-label="Company">
            <form className="bench-stack" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveCompany(company); setMsg(r.ok ? { ok: "Company details saved." } : { error: r.error }); if (r.ok) router.refresh(); }); }}>
              <div className="bench-grid-2">
                <div className="bench-field"><label className="bench-label" htmlFor="bp-name">Brand name</label><input id="bp-name" className="bench-input" value={company.name} disabled={!isOwner} maxLength={120} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
                <div className="bench-field"><label className="bench-label" htmlFor="bp-web">Website</label><input id="bp-web" className="bench-input" value={company.website} disabled={!isOwner} placeholder="yourbrand.com" onChange={(e) => setCompany({ ...company, website: e.target.value })} /></div>
                <div className="bench-field"><label className="bench-label" htmlFor="bp-city">HQ city</label><input id="bp-city" className="bench-input" value={company.hq_city} disabled={!isOwner} maxLength={80} onChange={(e) => setCompany({ ...company, hq_city: e.target.value })} /></div>
                <div className="bench-field">
                  <label className="bench-label" htmlFor="bp-st">HQ state</label>
                  <select id="bp-st" className="bench-input" value={company.hq_state} disabled={!isOwner} onChange={(e) => setCompany({ ...company, hq_state: e.target.value })}>
                    <option value="">Choose…</option>{refs.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {isOwner ? <div><button type="submit" className="button is-small w-button" disabled={pending}>Save company details</button></div> : <p className="bench-small bench-muted" style={{ margin: 0 }}>Only owners can change the name and website.</p>}
            </form>
            <div className="bench-field"><label className="bench-label" htmlFor="bp-about">About your brand</label><textarea id="bp-about" className="bench-input" maxLength={2000} value={p.about ?? ""} placeholder="What you make, what makes it different, and who buys it." onChange={(e) => set({ about: e.target.value })} /></div>
            <div className="bench-field"><span className="bench-label">Categories</span><RefPicker label="Categories" placeholder="Add a category, e.g. Meat snacks" options={refs.categories} selected={p.categories} onChange={(v) => set({ categories: v })} /></div>
            <div className="bench-grid-3">
              <Select id="bp-stage" label="Stage" value={p.stage} options={STAGE} onChange={(v) => set({ stage: v })} />
              <Select id="bp-rev" label="Annual revenue" value={p.annual_revenue_band} options={REVENUE} onChange={(v) => set({ annual_revenue_band: v })} />
              <div className="bench-field"><label className="bench-label" htmlFor="bp-year">Founded</label><input id="bp-year" className="bench-input" inputMode="numeric" value={p.founded_year ?? ""} onChange={(e) => set({ founded_year: /^\d{4}$/.test(e.target.value) ? Number(e.target.value) : null })} placeholder="2021" /></div>
            </div>
            <div className="bench-field"><span className="bench-label">Certifications and attributes</span><Chips label="Certifications" options={opts(CERTIFICATIONS)} selected={p.certifications} onChange={(v) => set({ certifications: v })} /></div>
            <div className="bench-field"><span className="bench-label">Storage</span><Chips label="Storage" options={opts(STORAGE)} selected={p.storage ? [p.storage] : []} onChange={(v) => set({ storage: v.at(-1) ?? null })} /></div>
          </section>
        )}

        {step === "products" && <Products products={products} onMsg={setMsg} />}

        {step === "today" && (
          <section className="bench-section bench-stack" aria-label="Where you sell today">
            <p className="bench-small bench-muted" style={{ margin: 0 }}>Brokers want to know your current footprint. Skip anything that doesn&rsquo;t apply.</p>
            <div className="bench-field"><span className="bench-label">Retailers you&rsquo;re in now</span><RefPicker label="Current retailers" placeholder="Add a retailer, e.g. Whole Foods" options={refs.retailers} selected={p.current_retailers} onChange={(v) => set({ current_retailers: v })} /></div>
            <div className="bench-field"><span className="bench-label">Distributors you work with</span><Chips label="Current distributors" options={refs.distributors} selected={p.current_distributors} onChange={(v) => set({ current_distributors: v })} /></div>
            <div className="bench-field"><span className="bench-label">Channels you sell in</span><Chips label="Current channels" options={refs.channels} selected={p.current_channels} onChange={(v) => set({ current_channels: v })} /></div>
            <div className="bench-field" style={{ maxWidth: 260 }}><label className="bench-label" htmlFor="bp-doors">Number of stores (doors)</label><input id="bp-doors" className="bench-input" inputMode="numeric" value={p.current_doors ?? ""} onChange={(e) => set({ current_doors: /^\d+$/.test(e.target.value) ? Number(e.target.value) : null })} /></div>
            <span className="bench-label">States you&rsquo;re sold in</span>
            <UsTileMap selected={new Set(p.current_states)} names={names} onToggle={(code) => toggleState("current_states", code)} />
          </section>
        )}

        {step === "goals" && (
          <section className="bench-section bench-stack" aria-label="Where you want to be">
            <p className="bench-small bench-muted" style={{ margin: 0 }}>This is what brokers are matched on. It ranks search results when you haven&rsquo;t picked a brief.</p>
            <div className="bench-field"><span className="bench-label">Retailers you want to be in</span><RefPicker label="Target retailers" placeholder="Add a retailer, e.g. Kroger" options={refs.retailers} selected={p.target_retailers} onChange={(v) => set({ target_retailers: v })} /></div>
            <div className="bench-field"><span className="bench-label">Distributors you want</span><Chips label="Target distributors" options={refs.distributors} selected={p.target_distributors} onChange={(v) => set({ target_distributors: v })} /></div>
            <div className="bench-field"><span className="bench-label">Channels you want</span><Chips label="Target channels" options={refs.channels} selected={p.target_channels} onChange={(v) => set({ target_channels: v })} /></div>
            <div className="bench-field"><span className="bench-label">Regions</span><Chips label="Target regions" options={refs.regions.map((r) => ({ id: r.code, name: r.name }))} selected={p.target_regions} onChange={(v) => set({ target_regions: v })} /></div>
            <span className="bench-label">Or specific states</span>
            <UsTileMap selected={new Set(p.target_states)} names={names} onToggle={(code) => toggleState("target_states", code)} />
            <h3 className="bench-eyebrow" style={{ marginTop: 12 }}>Working with a broker</h3>
            <div className="bench-grid-3">
              <Select id="bp-time" label="Timeline" value={p.timeline} options={TIMELINE} onChange={(v) => set({ timeline: v })} />
              <Select id="bp-model" label="How you'll pay a broker" value={p.commission_pref} options={COMMISSION} onChange={(v) => set({ commission_pref: v })} />
              <Select id="bp-trade" label="Trade and promo budget" value={p.trade_budget_band} options={TRADE} onChange={(v) => set({ trade_budget_band: v })} />
            </div>
            <div className="bench-grid-2">
              <div className="bench-field"><label className="bench-label" htmlFor="bp-rate">Up to what commission (%)</label><input id="bp-rate" className="bench-input" inputMode="decimal" value={p.max_rate ?? ""} onChange={(e) => set({ max_rate: num(e.target.value) })} placeholder="5" /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="bp-ret">Up to what monthly retainer ($)</label><input id="bp-ret" className="bench-input" inputMode="decimal" value={p.max_retainer ?? ""} onChange={(e) => set({ max_retainer: num(e.target.value) })} placeholder="1500" /></div>
            </div>
            <div className="bench-field"><label className="bench-label" htmlFor="bp-need">What you need from a broker</label><textarea id="bp-need" className="bench-input" maxLength={2000} value={p.looking_for ?? ""} placeholder="e.g. Category reviews at Kroger and Meijer this spring, plus help with KeHE item setup." onChange={(e) => set({ looking_for: e.target.value })} /></div>
          </section>
        )}

        {step === "dataroom" && <DataRoom orgId={orgId} files={files} onMsg={setMsg} />}

        <div className="bench-row" style={{ justifyContent: "space-between" }}>
          {STEPS.findIndex(([k]) => k === step) > 0 ? <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => setStep(STEPS[STEPS.findIndex(([k]) => k === step) - 1][0])}>Back</button> : <span />}
          {STEPS.findIndex(([k]) => k === step) < STEPS.length - 1 && <button type="button" className="button is-small w-button" onClick={() => { setStep(STEPS[STEPS.findIndex(([k]) => k === step) + 1][0]); window.scrollTo({ top: 0 }); }}>Next</button>}
        </div>
      </div>

      <aside className="bench-stack bench-builder_side">
        <div className="bench-card bench-stack" style={{ gap: 10 }}>
          <div className="bench-eyebrow">Profile strength</div>
          <div className="bench-h-section" style={{ margin: 0 }}>{pct}%</div>
          <div className="bench-progress" aria-hidden="true" style={{ marginTop: 0 }}><span style={{ width: `${pct}%` }} /></div>
          <ul className="bench-todo">
            {items.map((i) => (
              <li key={i.key} style={i.done ? { color: "var(--pv-muted)", textDecoration: "line-through" } : undefined}>
                {i.done ? <span>{i.label}</span> : <button type="button" className="bench-link-btn" onClick={() => setStep(i.step)}>{i.label}</button>}
                {i.done && <span className="bench-sr-only"> (done)</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Brokers see your profile, products and data room only after you message them. Brands are never listed publicly.</p>
        <a className="button bench-btn-ghost w-button bench-btn-block" href="/app/brand/preview">Preview what brokers see</a>
      </aside>
    </div>
  );
}

function Products({ products, onMsg }: { products: Product[]; onMsg: (m: { ok?: string; error?: string } | null) => void }) {
  const router = useRouter();
  const blank = { id: null as string | null, name: "", description: "", size: "", case_pack: "", msrp: "", wholesale: "", upc: "", shelf_life_days: "", storage: "" };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(products.length === 0);
  const [pending, start] = useTransition();
  const edit = (x: Product) => { setF({ id: x.id, name: x.name, description: x.description ?? "", size: x.size ?? "", case_pack: x.case_pack?.toString() ?? "", msrp: x.msrp?.toString() ?? "", wholesale: x.wholesale?.toString() ?? "", upc: x.upc ?? "", shelf_life_days: x.shelf_life_days?.toString() ?? "", storage: x.storage ?? "" }); setOpen(true); };
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <section className="bench-section bench-stack" aria-label="Products">
      {products.length > 0 && (
        <div className="bench-table-wrap">
          <table className="bench-table">
            <thead><tr><th scope="col">Product</th><th scope="col">Size</th><th scope="col">MSRP</th><th scope="col">Case pack</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {products.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}{x.upc && <div className="bench-small bench-muted">UPC {x.upc}</div>}</td>
                  <td>{x.size ?? "—"}</td>
                  <td>{x.msrp != null ? `$${Number(x.msrp).toFixed(2)}` : "—"}</td>
                  <td>{x.case_pack ?? "—"}</td>
                  <td>
                    <div className="bench-row" style={{ gap: 12 }}>
                      <button type="button" className="bench-link-btn" onClick={() => edit(x)}>Edit</button>
                      <button type="button" className="bench-link-btn" disabled={pending} onClick={() => start(async () => { const r = await deleteProduct(x.id); onMsg(r.ok ? { ok: `Removed ${x.name}.` } : { error: r.error }); router.refresh(); })}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!open ? (
        <div><button type="button" className="button is-small w-button" onClick={() => { setF(blank); setOpen(true); }}>Add a product</button></div>
      ) : (
        <form className="bench-card is-white bench-form" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveProduct({ id: f.id, name: f.name, description: f.description, size: f.size, case_pack: n(f.case_pack), msrp: n(f.msrp), wholesale: n(f.wholesale), upc: f.upc, shelf_life_days: n(f.shelf_life_days), storage: (f.storage || null) as "ambient" | null });
            if (r.ok) { onMsg({ ok: `${f.name} saved.` }); setF(blank); setOpen(false); router.refresh(); } else onMsg({ error: r.error });
          });
        }}>
          <h3 className="bench-eyebrow" style={{ margin: 0 }}>{f.id ? "Edit product" : "Add a product"}</h3>
          <div className="bench-grid-2">
            <div className="bench-field"><label className="bench-label" htmlFor="pr-name">Product name</label><input id="pr-name" className="bench-input" required maxLength={160} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Original Beef Jerky" /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="pr-size">Size</label><input id="pr-size" className="bench-input" maxLength={60} value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} placeholder="2.5 oz" /></div>
          </div>
          <div className="bench-field"><label className="bench-label" htmlFor="pr-desc">Description</label><input id="pr-desc" className="bench-input" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="bench-grid-3">
            <div className="bench-field"><label className="bench-label" htmlFor="pr-msrp">MSRP ($)</label><input id="pr-msrp" className="bench-input" inputMode="decimal" value={f.msrp} onChange={(e) => setF({ ...f, msrp: e.target.value })} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="pr-whl">Wholesale ($)</label><input id="pr-whl" className="bench-input" inputMode="decimal" value={f.wholesale} onChange={(e) => setF({ ...f, wholesale: e.target.value })} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="pr-case">Case pack</label><input id="pr-case" className="bench-input" inputMode="numeric" value={f.case_pack} onChange={(e) => setF({ ...f, case_pack: e.target.value })} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="pr-upc">UPC</label><input id="pr-upc" className="bench-input" inputMode="numeric" value={f.upc} onChange={(e) => setF({ ...f, upc: e.target.value })} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="pr-shelf">Shelf life (days)</label><input id="pr-shelf" className="bench-input" inputMode="numeric" value={f.shelf_life_days} onChange={(e) => setF({ ...f, shelf_life_days: e.target.value })} /></div>
            <div className="bench-field">
              <label className="bench-label" htmlFor="pr-store">Storage</label>
              <select id="pr-store" className="bench-input" value={f.storage} onChange={(e) => setF({ ...f, storage: e.target.value })}><option value="">Choose…</option>{STORAGE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
          </div>
          <p className="bench-small bench-muted" style={{ margin: 0 }}>Product photos go in your data room, under Product photos.</p>
          <div className="bench-row">
            <button type="submit" className="button is-small w-button" disabled={pending}>Save product</button>
            {products.length > 0 && <button type="button" className="bench-link-btn" onClick={() => setOpen(false)}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  );
}

function DataRoom({ orgId, files, onMsg }: { orgId: string; files: DataFile[]; onMsg: (m: { ok?: string; error?: string } | null) => void }) {
  const router = useRouter();
  const [folder, setFolder] = useState<string>("Sell sheets");
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const supabase = createClient();
    let added = 0;
    for (const f of Array.from(list)) {
      if (f.size > 25 * 1024 * 1024) { onMsg({ error: `${f.name} is over 25 MB.` }); continue; }
      const ext = (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("brand-files").upload(path, f, { contentType: f.type });
      if (error) { onMsg({ error: `${f.name}: upload failed.` }); continue; }
      const r = await registerBrandFile({ path, name: f.name.slice(0, 200), mime: f.type, folder });
      if (r.error) { onMsg({ error: `${f.name}: ${r.error}` }); continue; }
      added++;
    }
    setBusy(false);
    if (added) { onMsg({ ok: `${added} file${added === 1 ? "" : "s"} added to ${folder}.` }); router.refresh(); }
  }
  const groups = DATA_ROOM_FOLDERS.map((g) => ({ g, rows: files.filter((x) => x.folder === g) })).filter((x) => x.rows.length);
  return (
    <section className="bench-section bench-stack" aria-label="Data room">
      <p className="bench-small bench-muted" style={{ margin: 0 }}>Your sell sheets, decks, photos, spec sheets and pricing in one place. Brokers you message can open them; nobody else can. PDF, images, Office files or CSV, up to 25 MB each.</p>
      <div className="bench-row">
        <label className="bench-sr-only" htmlFor="dr-folder">Folder</label>
        <select id="dr-folder" className="bench-input" style={{ width: "auto", minHeight: 44 }} value={folder} onChange={(e) => setFolder(e.target.value)}>
          {DATA_ROOM_FOLDERS.map((g) => <option key={g}>{g}</option>)}
        </select>
        <label className="button is-small w-button" style={{ cursor: busy ? "progress" : "pointer" }}>
          {busy ? "Uploading…" : "Upload files"}
          <input type="file" multiple className="bench-sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.pptx,.xlsx,.docx,.xls,.ppt" />
        </label>
      </div>
      {groups.length === 0 ? <p className="bench-muted" style={{ margin: 0 }}>No files yet. Start with a sell sheet.</p> : groups.map(({ g, rows }) => (
        <div key={g} className="bench-stack" style={{ gap: 8 }}>
          <h3 className="bench-eyebrow" style={{ margin: 0 }}>{g}</h3>
          <ul className="bench-plainlist">
            {rows.map((x) => (
              <li key={x.id} className="bench-row" style={{ justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--pv-line-soft)" }}>
                <button type="button" className="bench-link-btn" onClick={() => start(async () => { const r = await openBrandFile(x.id); if (r.url) window.open(r.url, "_blank", "noopener"); else onMsg({ error: r.error }); })}>{x.name}</button>
                <span className="bench-row bench-small bench-muted" style={{ gap: 12 }}>
                  {fmtSize(x.size)}
                  <button type="button" className="bench-link-btn" onClick={() => start(async () => { const r = await deleteBrandFile(x.id); onMsg(r.ok ? { ok: `Deleted ${x.name}.` } : { error: r.error }); router.refresh(); })}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
