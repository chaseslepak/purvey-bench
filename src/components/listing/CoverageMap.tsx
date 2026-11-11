import { TILES } from "./tiles";

/** Read-only coverage map for profiles. The state list is the accessible version. */
export function CoverageMap({ states, names }: { states: string[]; names: Record<string, string> }) {
  const on = new Set(states);
  return (
    <figure className="bench-stack" style={{ margin: 0, gap: 10 }}>
      <div className="bench-tilemap" aria-hidden="true">
        {TILES.map(([code, row, col]) => (
          <span key={code} className="bench-tile is-static" data-on={on.has(code) || undefined} style={{ gridRow: row + 1, gridColumn: col + 1 }}>{code}</span>
        ))}
      </div>
      <figcaption className="bench-small bench-muted">
        {states.length === 0 ? "No states listed." : `Covers ${states.length} state${states.length === 1 ? "" : "s"}: ${states.map((s) => names[s] ?? s).sort().join(", ")}.`}
      </figcaption>
    </figure>
  );
}
