"use client";

import { useState } from "react";

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** A 1–5 star picker built on native radios, so it works by keyboard (arrow keys) and screen reader. */
export function StarInput({ name, value, onChange }: { name: string; value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="bench-starinput" onMouseLeave={() => setHover(0)}>
      <legend className="bench-label">Your rating</legend>
      <div className="bench-row" style={{ gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`bench-starinput_star${n <= shown ? " is-on" : ""}`} onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} required className="bench-sr-only" />
            <span aria-hidden="true">★</span>
            <span className="bench-sr-only">{n} star{n === 1 ? "" : "s"}, {WORDS[n]}</span>
          </label>
        ))}
        <span className="bench-small bench-muted" style={{ marginLeft: 10 }} aria-hidden="true">{shown ? WORDS[shown] : "Choose 1 to 5 stars"}</span>
      </div>
    </fieldset>
  );
}
