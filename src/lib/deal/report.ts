/**
 * Read a distributor/retailer sales report (CSV) into per-account lines for
 * the commission true-up. Columns are found by their headings, so exports
 * from UNFI, KeHE and retailer portals work without a fixed template.
 * Sales figures come only from the brand's file; the broker can change
 * coverage flags and adjustments, never these numbers.
 */
export type ReportLine = { account: string; distributor: string; units: number; gross: number; deductions: number; covered: boolean };
export type ParsedReport = { lines: ReportLine[]; columns: Record<string, string | null>; rows: number; warnings: string[] };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function money(v: string | undefined): number {
  if (!v) return 0;
  const neg = /^\s*\(.*\)\s*$/.test(v) || /^\s*-/.test(v);
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

const PATTERNS = {
  account: /\b(customer|account|retailer|chain|banner|store name|ship to name|ship to|sold to|bill to|location)\b/,
  distributor: /\b(distributor|warehouse|vendor name|dc name)\b/,
  units: /\b(units|unit qty|qty|quantity|eaches|cases shipped|cases|ship qty)\b/,
  gross: /\b(gross|gross sales|sales amount|sales \$|sales dollars|extended (cost|price|amount)|ext (cost|price|amt)|invoice amount|dollars|revenue|sales)\b/,
  net: /\b(net sales|net amount|net \$|net)\b/,
  deductions: /\b(deduction|deductions|allowance|allowances|chargeback|chargebacks|mcb|billback|promo|promotion|discount|spoils?|credit|unsaleables?)\b/,
};

export function parseSalesReport(csv: string, opts: { defaultDistributor: string; coveredAccounts: string[] }): ParsedReport {
  const rows = parseCsv(csv);
  const warnings: string[] = [];
  if (rows.length < 2) return { lines: [], columns: {}, rows: 0, warnings: ["The file has no data rows."] };
  // The header is the first row naming an account column AND a units or sales
  // column (exports often start with title rows like "Sales by Customer").
  const headerIdx = rows.findIndex((r) => {
    const cells = r.map(norm).filter(Boolean);
    return cells.some((h) => PATTERNS.account.test(h)) && cells.some((h) => PATTERNS.units.test(h) || PATTERNS.gross.test(h) || PATTERNS.net.test(h)) && cells.length >= 2;
  });
  if (headerIdx < 0) return { lines: [], columns: {}, rows: 0, warnings: ["Couldn't find a customer or account column."] };
  const header = rows[headerIdx].map(norm);
  const find = (re: RegExp, exclude: number[] = []) => header.findIndex((h, i) => re.test(h) && !exclude.includes(i));
  const account = find(PATTERNS.account);
  const distributor = find(PATTERNS.distributor, [account]);
  const units = find(PATTERNS.units, [account]);
  const net = header.findIndex((h) => PATTERNS.net.test(h) && !PATTERNS.deductions.test(h));
  const gross = header.findIndex((h, i) => PATTERNS.gross.test(h) && i !== net && !/\bnet\b/.test(h) && !PATTERNS.deductions.test(h));
  const deductionCols = header.map((h, i) => (PATTERNS.deductions.test(h) && i !== account ? i : -1)).filter((i) => i >= 0);
  if (gross < 0 && net < 0) warnings.push("Couldn't find a sales amount column (gross or net).");

  const coverKeys = opts.coveredAccounts.map(norm).filter(Boolean);
  const byAccount = new Map<string, ReportLine>();
  let dataRows = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const name = (r[account] ?? "").trim();
    if (!name || /^(total|grand total|subtotal)\b/i.test(name)) continue;
    dataRows++;
    const ded = deductionCols.reduce((s, i) => s + Math.abs(money(r[i])), 0);
    let g = gross >= 0 ? money(r[gross]) : 0;
    if (gross < 0 && net >= 0) g = money(r[net]) + ded;
    const d = gross >= 0 && net >= 0 && deductionCols.length === 0 ? Math.max(0, g - money(r[net])) : ded;
    const key = norm(name);
    const line = byAccount.get(key) ?? {
      account: name, distributor: distributor >= 0 && r[distributor]?.trim() ? r[distributor].trim() : opts.defaultDistributor,
      units: 0, gross: 0, deductions: 0, covered: coverKeys.some((c) => key.includes(c) || c.includes(key)),
    };
    line.units += units >= 0 ? Math.round(money(r[units])) : 0;
    line.gross = Math.round((line.gross + g) * 100) / 100;
    line.deductions = Math.round((line.deductions + d) * 100) / 100;
    byAccount.set(key, line);
  }
  const lines = [...byAccount.values()].sort((a, b) => Number(b.covered) - Number(a.covered) || b.gross - a.gross);
  if (!lines.some((l) => l.covered) && lines.length) warnings.push("None of the accounts matched the partnership's accounts. The broker can mark covered accounts before invoicing.");
  const col = (i: number) => (i >= 0 ? rows[headerIdx][i] : null);
  return {
    lines, rows: dataRows, warnings,
    columns: { account: col(account), distributor: col(distributor), units: col(units), gross: col(gross), net: col(net), deductions: deductionCols.map((i) => rows[headerIdx][i]).join(", ") || null },
  };
}
