"use client";

/**
 * Clickable U.S. map as an equal-area tile grid: every state is the same
 * size, so small Northeast states are as easy to hit as Texas, and every
 * tile is a real toggle button (keyboard and screen-reader friendly).
 */
const TILES: [string, number, number][] = [
  ["AK", 0, 0], ["ME", 0, 10],
  ["WI", 1, 5], ["VT", 1, 9], ["NH", 1, 10],
  ["WA", 2, 0], ["ID", 2, 1], ["MT", 2, 2], ["ND", 2, 3], ["MN", 2, 4], ["IL", 2, 5], ["MI", 2, 6], ["NY", 2, 8], ["MA", 2, 9],
  ["OR", 3, 0], ["NV", 3, 1], ["WY", 3, 2], ["SD", 3, 3], ["IA", 3, 4], ["IN", 3, 5], ["OH", 3, 6], ["PA", 3, 7], ["NJ", 3, 8], ["CT", 3, 9], ["RI", 3, 10],
  ["CA", 4, 0], ["UT", 4, 1], ["CO", 4, 2], ["NE", 4, 3], ["MO", 4, 4], ["KY", 4, 5], ["WV", 4, 6], ["VA", 4, 7], ["MD", 4, 8], ["DE", 4, 9],
  ["AZ", 5, 1], ["NM", 5, 2], ["KS", 5, 3], ["AR", 5, 4], ["TN", 5, 5], ["NC", 5, 6], ["SC", 5, 7], ["DC", 5, 8],
  ["OK", 6, 3], ["LA", 6, 4], ["MS", 6, 5], ["AL", 6, 6], ["GA", 6, 7],
  ["HI", 7, 0], ["TX", 7, 3], ["FL", 7, 8],
];

export function UsTileMap({
  selected,
  names,
  onToggle,
}: {
  selected: Set<string>;
  names: Record<string, string>;
  onToggle: (code: string) => void;
}) {
  return (
    <div className="bench-tilemap" role="group" aria-label="States covered">
      {TILES.map(([code, row, col]) => {
        const on = selected.has(code);
        return (
          <button
            key={code}
            type="button"
            className="bench-tile"
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
            aria-pressed={on}
            title={names[code] ?? code}
            onClick={() => onToggle(code)}
          >
            {code}
            <span className="bench-sr-only"> {names[code] ?? ""}</span>
          </button>
        );
      })}
    </div>
  );
}
