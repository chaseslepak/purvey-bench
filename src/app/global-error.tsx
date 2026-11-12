"use client";

/** Last resort when the root layout itself fails. Plain HTML, no app styles. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 32, background: "#cbc9c6" }}>
        <main style={{ background: "#fff", borderRadius: 24, padding: 32, maxWidth: 640 }}>
          <h1 style={{ fontWeight: 400 }}>Purvey Bench is having trouble.</h1>
          <p>Please try again in a moment.</p>
          <button type="button" onClick={() => reset()} style={{ padding: "12px 20px", borderRadius: 8, border: 0, background: "#3676b1", color: "#fff", cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
