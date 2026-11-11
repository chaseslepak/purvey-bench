export type Freq = "weekly" | "monthly" | "occasional";
export const FREQ_LABEL: Record<Freq, string> = { weekly: "Weekly", monthly: "Monthly", occasional: "Occasional" };
const FREQ_ORDER: Record<Freq, number> = { weekly: 0, monthly: 1, occasional: 2 };

/**
 * "National", "Midwest + Southeast", or "Midwest + 2 more states", or a list
 * of up to four state codes. Whole regions are named; leftovers are counted.
 */
export function coverageSummary(
  selected: string[],
  states: { code: string; region_code: string }[],
  regions: { code: string; name: string }[],
): string {
  if (selected.length === 0) return "No states yet";
  const set = new Set(selected);
  if (states.length > 0 && states.every((s) => set.has(s.code))) return "National";
  const full: string[] = [];
  const covered = new Set<string>();
  for (const r of regions) {
    const inRegion = states.filter((s) => s.region_code === r.code);
    if (inRegion.length && inRegion.every((s) => set.has(s.code))) {
      full.push(r.name);
      inRegion.forEach((s) => covered.add(s.code));
    }
  }
  const rest = selected.filter((c) => !covered.has(c)).sort();
  if (full.length === 0) return rest.length <= 4 ? rest.join(", ") : `${rest.slice(0, 3).join(", ")} + ${rest.length - 3} more`;
  if (rest.length === 0) return full.join(" + ");
  return `${full.join(" + ")} + ${rest.length} more state${rest.length === 1 ? "" : "s"}`;
}

/** Top retailers for a card: most frequent calls first, then name. */
export function topRetailers<T extends { name: string; freq: Freq }>(rows: T[], n = 5): T[] {
  return [...rows].sort((a, b) => FREQ_ORDER[a.freq] - FREQ_ORDER[b.freq] || a.name.localeCompare(b.name)).slice(0, n);
}
