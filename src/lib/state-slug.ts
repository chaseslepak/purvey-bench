/** "New York" -> "new-york". Used for /brokers-in/[state] URLs. */
export const stateSlug = (s: { name: string }) => s.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
