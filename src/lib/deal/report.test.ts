import { describe, expect, it } from "vitest";
import { money, parseCsv, parseSalesReport } from "./report";

// Synthetic layouts in the style of distributor exports (real samples pending).
const UNFI_LIKE = `UNFI Sales by Customer,,,,,
Period: March 2027,,,,,
Customer Name,Ship To,Units,Gross Sales $,Promo Allowance,MCB
"JEWEL OSCO #3021","Melrose Park, IL",1210,"$5,262.55",(420.00),$410.10
"JEWEL OSCO #3077","Chicago, IL",2354,"10,240.45",-900.00,750.00
WHOLE FOODS NATURAL IND,Chicago IL,4120,"17,304.00",1000,730
Total,,7684,"32,807.00",,`;

const KEHE_LIKE = `Retailer,Distributor,Qty,Ext Cost,Net Amount
Meijer,KeHE,800,4000.00,3600.00
Meijer,KeHE,200,1000.00,900.00
Festival Foods,KeHE,50,250.00,250.00`;

describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
  it("reads money with $, commas and parentheses", () => {
    expect([money("$5,262.55"), money("(420.00)"), money("-900"), money("")]).toEqual([5262.55, -420, -900, 0]);
  });
});

describe("parseSalesReport", () => {
  it("UNFI-style: skips title rows, sums stores per account, adds up all deduction columns, ignores totals", () => {
    const r = parseSalesReport(UNFI_LIKE, { defaultDistributor: "UNFI", coveredAccounts: ["Jewel-Osco", "Kroger"] });
    expect(r.rows).toBe(3);
    expect(r.columns).toMatchObject({ account: "Customer Name", units: "Units", gross: "Gross Sales $", deductions: "Promo Allowance, MCB" });
    // Store-level rows are separate accounts by name; both Jewel stores are covered.
    const jewel = r.lines.filter((l) => l.covered);
    expect(jewel.map((l) => l.account)).toEqual(["JEWEL OSCO #3077", "JEWEL OSCO #3021"]);
    expect(jewel[1]).toMatchObject({ units: 1210, gross: 5262.55, deductions: 830.1, distributor: "UNFI" });
    expect(r.lines.find((l) => !l.covered)).toMatchObject({ account: "WHOLE FOODS NATURAL IND", deductions: 1730 });
  });
  it("KeHE-style: groups rows by retailer and derives deductions from gross minus net", () => {
    const r = parseSalesReport(KEHE_LIKE, { defaultDistributor: "KeHE", coveredAccounts: ["Meijer"] });
    expect(r.lines).toEqual([
      { account: "Meijer", distributor: "KeHE", units: 1000, gross: 5000, deductions: 500, covered: true },
      { account: "Festival Foods", distributor: "KeHE", units: 50, gross: 250, deductions: 0, covered: false },
    ]);
  });
  it("explains what it couldn't find", () => {
    expect(parseSalesReport("foo,bar\n1,2", { defaultDistributor: "UNFI", coveredAccounts: [] }).warnings[0]).toMatch(/customer or account/);
  });
});
