"use client";

import { TILES } from "./tiles";

/**
 * Clickable U.S. map as an equal-area tile grid: every state is the same
 * size, so small Northeast states are as easy to hit as Texas, and every
 * tile is a real toggle button (keyboard and screen-reader friendly).
 */


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
