import type { FitBrief } from "@/lib/fit";

/** Option lists for the brand profile. Keys match the database checks. */
export const CERTIFICATIONS = [
  ["organic", "USDA Organic"], ["non_gmo", "Non-GMO"], ["gluten_free", "Gluten-free"], ["vegan", "Vegan"], ["plant_based", "Plant-based"],
  ["kosher", "Kosher"], ["halal", "Halal"], ["keto", "Keto"], ["paleo", "Paleo"], ["whole30", "Whole30"], ["fair_trade", "Fair Trade"],
  ["b_corp", "B Corp"], ["women_owned", "Women-owned"], ["minority_owned", "Minority-owned"], ["veteran_owned", "Veteran-owned"],
] as const;
export const STORAGE = [["ambient", "Shelf-stable"], ["refrigerated", "Refrigerated"], ["frozen", "Frozen"]] as const;
export const TIMELINE = [["now", "Ready now"], ["3_months", "Within 3 months"], ["6_months", "Within 6 months"], ["exploring", "Just exploring"]] as const;
export const REVENUE = [["pre_revenue", "Pre-revenue"], ["under_250k", "Under $250K"], ["250k_1m", "$250K–$1M"], ["1m_5m", "$1M–$5M"], ["5m_20m", "$5M–$20M"], ["20m_plus", "$20M+"]] as const;
export const STAGE = [["launching", "Launching"], ["regional", "Regional"], ["national", "National"], ["established", "Established"]] as const;
export const TRADE = [["under_10k", "Under $10K/yr"], ["10k_50k", "$10K–$50K/yr"], ["50k_150k", "$50K–$150K/yr"], ["150k_plus", "$150K+/yr"]] as const;
export const COMMISSION = [["pct_net_sales", "% of net sales"], ["retainer_plus_pct", "Retainer + % of net sales"], ["retainer_only", "Retainer only"]] as const;
export const DATA_ROOM_FOLDERS = ["Sell sheets", "Decks", "Product photos", "Spec sheets", "Pricing", "Marketing", "Other"] as const;

export const label = (list: readonly (readonly [string, string])[], key: string | null | undefined) => list.find(([k]) => k === key)?.[1] ?? null;

export type BrandProfile = {
  about: string | null; founded_year: number | null; annual_revenue_band: string | null; stage: string | null;
  categories: number[]; certifications: string[]; storage: string | null;
  current_retailers: number[]; current_distributors: number[]; current_states: string[]; current_channels: number[]; current_doors: number | null;
  target_retailers: number[]; target_distributors: number[]; target_regions: string[]; target_states: string[]; target_channels: number[];
  timeline: string | null; commission_pref: string | null; max_rate: number | null; max_retainer: number | null; trade_budget_band: string | null; looking_for: string | null;
};

export const EMPTY_PROFILE: BrandProfile = {
  about: null, founded_year: null, annual_revenue_band: null, stage: null, categories: [], certifications: [], storage: null,
  current_retailers: [], current_distributors: [], current_states: [], current_channels: [], current_doors: null,
  target_retailers: [], target_distributors: [], target_regions: [], target_states: [], target_channels: [],
  timeline: null, commission_pref: null, max_rate: null, max_retainer: null, trade_budget_band: null, looking_for: null,
};

export type Step = "company" | "products" | "today" | "goals" | "dataroom";
export type CheckItem = { key: string; label: string; step: Step; done: boolean };

/** What makes a brand profile useful to a broker. Drives the strength score and the to-do list. */
export function brandChecklist(p: BrandProfile, counts: { products: number; files: number; website: boolean }): CheckItem[] {
  return [
    { key: "about", label: "Describe your brand in a few sentences", step: "company", done: (p.about ?? "").trim().length >= 40 },
    { key: "category", label: "Choose your category", step: "company", done: p.categories.length > 0 },
    { key: "website", label: "Add your website", step: "company", done: counts.website },
    { key: "stage", label: "Add your stage and revenue band", step: "company", done: !!p.stage && !!p.annual_revenue_band },
    { key: "products", label: "Add at least one product", step: "products", done: counts.products > 0 },
    { key: "today", label: "Say where you sell today (retailers, distributors or states)", step: "today", done: p.current_retailers.length + p.current_distributors.length + p.current_states.length > 0 },
    { key: "target_retailers", label: "Pick the retailers you want to be in", step: "goals", done: p.target_retailers.length > 0 },
    { key: "target_area", label: "Pick the regions or states you're targeting", step: "goals", done: p.target_regions.length + p.target_states.length > 0 },
    { key: "terms", label: "Share your timeline and what you'll pay a broker", step: "goals", done: !!p.timeline && !!p.commission_pref },
    { key: "files", label: "Add a sell sheet or deck to your data room", step: "dataroom", done: counts.files > 0 },
  ];
}

export const completeness = (items: CheckItem[]) => Math.round((100 * items.filter((i) => i.done).length) / items.length);

/** The brand profile's goals as a fit brief, used when the brand hasn't picked a brief. */
export function profileToFit(p: BrandProfile, states: { code: string; region_code: string }[]): FitBrief | null {
  const regionStates = states.filter((s) => p.target_regions.includes(s.region_code)).map((s) => s.code);
  const fit: FitBrief = {
    states: [...new Set([...p.target_states, ...regionStates])],
    retailers: p.target_retailers,
    channels: p.target_channels,
    categoryId: p.categories[0] ?? null,
    distributors: p.target_distributors,
  };
  const anything = fit.states.length || fit.retailers.length || fit.channels.length || fit.categoryId || fit.distributors.length;
  return anything ? fit : null;
}
