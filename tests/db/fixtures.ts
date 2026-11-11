/** Deterministic fixture ids shared by global-setup and the tests. */
export const U = {
  alice: "00000000-0000-4000-a000-000000000001", // brand A owner
  amy: "00000000-0000-4000-a000-000000000002",   // brand A member
  bob: "00000000-0000-4000-a000-000000000003",   // brand B owner
  xavier: "00000000-0000-4000-a000-000000000004", // broker X owner (live)
  xena: "00000000-0000-4000-a000-000000000005",   // broker X member
  yolanda: "00000000-0000-4000-a000-000000000006", // broker Y owner (draft)
  pat: "00000000-0000-4000-a000-000000000007",    // Purvey admin
  newbie: "00000000-0000-4000-a000-000000000008", // signed up, no org yet
} as const;

export type Fixture = {
  brandA: string;
  brandB: string;
  brokerX: string;
  brokerY: string;
  listingX: string;
  listingY: string;
  briefA: string;
  convAX: string;
};
