import type { Freq } from "@/lib/coverage";

/**
 * Fit score (0-100), computed on the server. Same logic as the prototype:
 * for each part the brief sets, take the share of what the brief asks for
 * that the broker covers, then the weighted average over ONLY the parts the
 * brief set. A category conflict subtracts 25 (floor 0). Verified status and
 * payment never affect the score.
 */
export const WEIGHTS = { states: 35, retailers: 30, channels: 15, category: 15, distributors: 5 } as const;
export const FREQ_WEIGHT: Record<Freq, number> = { weekly: 1, monthly: 0.7, occasional: 0.4 };

export type FitBrief = {
  states: string[];        // brief states, with regions already expanded
  retailers: number[];     // target retailer ids
  channels: number[];
  categoryId: number | null;
  distributors: number[];
};
export type FitBroker = {
  states: string[];
  retailers: { retailerId: number | null; name: string; freq: Freq }[];
  channels: number[];
  categories: number[];
  conflicts: number[];
  distributors: number[];
};
export type FitResult = {
  score: number;
  parts: Partial<Record<keyof typeof WEIGHTS, number>>; // each 0..1
  matchedRetailers: { name: string; freq: Freq }[];
  conflict: boolean;
  reasons: string[];
};

const share = (want: (string | number)[], have: Set<string | number>) =>
  want.length ? want.filter((w) => have.has(w)).length / want.length : 0;

export function fitScore(brief: FitBrief, broker: FitBroker): FitResult | null {
  const parts: FitResult["parts"] = {};
  const wantStates = [...new Set(brief.states)];
  const wantRetailers = [...new Set(brief.retailers)];
  const wantChannels = [...new Set(brief.channels)];
  const wantDistributors = [...new Set(brief.distributors)];

  if (wantStates.length) parts.states = share(wantStates, new Set(broker.states));
  const byRetailer = new Map(broker.retailers.filter((r) => r.retailerId != null).map((r) => [r.retailerId!, r]));
  const matchedRetailers: FitResult["matchedRetailers"] = [];
  if (wantRetailers.length) {
    let sum = 0;
    for (const id of wantRetailers) {
      const r = byRetailer.get(id);
      if (r) { sum += FREQ_WEIGHT[r.freq]; matchedRetailers.push({ name: r.name, freq: r.freq }); }
    }
    parts.retailers = sum / wantRetailers.length;
  }
  if (wantChannels.length) parts.channels = share(wantChannels, new Set(broker.channels));
  if (brief.categoryId != null) parts.category = broker.categories.includes(brief.categoryId) ? 1 : 0;
  if (wantDistributors.length) parts.distributors = share(wantDistributors, new Set(broker.distributors));

  const keys = Object.keys(parts) as (keyof typeof WEIGHTS)[];
  if (!keys.length) return null;
  const totalWeight = keys.reduce((s, k) => s + WEIGHTS[k], 0);
  const raw = (100 * keys.reduce((s, k) => s + WEIGHTS[k] * parts[k]!, 0)) / totalWeight;
  const conflict = brief.categoryId != null && broker.conflicts.includes(brief.categoryId);
  const score = Math.max(0, Math.round(raw - (conflict ? 25 : 0)));

  matchedRetailers.sort((a, b) => FREQ_WEIGHT[b.freq] - FREQ_WEIGHT[a.freq] || a.name.localeCompare(b.name));
  const reasons: string[] = [];
  if (matchedRetailers.length) {
    const freqWord = { weekly: "weekly", monthly: "monthly", occasional: "occasionally" } as const;
    reasons.push("Covers " + matchedRetailers.slice(0, 3).map((r) => `${r.name} ${freqWord[r.freq]}`).join(", "));
  }
  if (wantStates.length) {
    const n = wantStates.filter((s) => broker.states.includes(s)).length;
    reasons.push(n === wantStates.length ? `All ${n} of your states` : `${n} of your ${wantStates.length} states`);
  }
  return { score, parts, matchedRetailers, conflict, reasons };
}
