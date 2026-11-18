import { matches, parseFilters, type Filters, type ListingRow } from "@/lib/search";
import type { Reference } from "@/lib/reference";

/** The filters a saved search keeps: what to match, not how to sort or page. */
export type SavedFilters = Omit<Filters, "page" | "sort" | "brief">;

/** Parse a /find query string (or object) into the filters worth saving. */
export function toSavedFilters(input: string | Record<string, string | string[] | undefined>): SavedFilters {
  const obj = typeof input === "string" ? Object.fromEntries(new URLSearchParams(input.replace(/^\?/, ""))) : input;
  const { page: _p, sort: _s, brief: _b, ...rest } = parseFilters(obj);
  void _p; void _s; void _b;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as SavedFilters;
}

/** The /find link that re-runs a saved search. */
export function searchHref(f: SavedFilters): string {
  const q = new URLSearchParams(Object.entries(f).map(([k, v]) => [k, String(v)]));
  const s = q.toString();
  return `/find${s ? `?${s}` : ""}`;
}

/** "Kroger · Midwest · Snacks · verified", for names and emails. */
export function describeSearch(f: SavedFilters, ref: Reference): string {
  const name = (list: { id: number; name: string }[], id?: number) => (id ? list.find((x) => x.id === id)?.name : undefined);
  const parts = [
    name(ref.retailers, f.retailer),
    f.region ? ref.regions.find((r) => r.code === f.region)?.name : undefined,
    f.state ? ref.states.find((s) => s.code === f.state)?.name : undefined,
    name(ref.channels, f.channel),
    name(ref.categories, f.category),
    name(ref.distributors, f.distributor),
    f.verified ? "verified" : undefined,
    f.taking ? "taking new lines" : undefined,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "All brokers";
}

/** Listings that match and went live after `since` (newest first). */
export function newMatches(all: ListingRow[], f: SavedFilters, ref: Reference, since: string): ListingRow[] {
  return all
    .filter((l) => l.liveSince && l.liveSince > since && matches(l, f as Filters, ref))
    .sort((a, b) => String(b.liveSince).localeCompare(String(a.liveSince)));
}
