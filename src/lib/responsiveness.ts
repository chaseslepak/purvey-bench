/**
 * Broker responsiveness, from public.broker_responsiveness(): how often and how
 * fast a brokerage answers brands (a real reply or a decline with a reason).
 * Display only; ranking stays by fit (README rule 4).
 */
export type Responsiveness = { received: number; answered: number; medianHours: number | null };

/** Fewer threads than this and the numbers say more about luck than the broker. */
export const MIN_THREADS = 3;

export function speedLabel(hours: number): string {
  if (hours <= 4) return "usually within a few hours";
  if (hours <= 24) return "usually within a day";
  if (hours <= 72) return "usually within 3 days";
  if (hours <= 168) return "usually within a week";
  return "usually in over a week";
}

/** "Answers 9 of 10 brands · usually within a day", or null when there isn't enough to say. */
export function responsivenessLabel(r: Responsiveness | null | undefined): string | null {
  if (!r || r.received < MIN_THREADS) return null;
  const pct = Math.round((100 * r.answered) / r.received);
  const rate = `Answers ${pct}% of brands`;
  return r.answered > 0 && r.medianHours != null ? `${rate} · ${speedLabel(r.medianHours)}` : rate;
}
