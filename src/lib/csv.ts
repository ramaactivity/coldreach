/**
 * Minimal CSV encoder.
 * Quotes any cell that contains a comma, double-quote, or newline.
 * Doubles up internal double-quotes (RFC 4180).
 */

// CSV/spreadsheet formula-injection guard. A cell beginning with = + - @ (or a
// leading tab/CR) is interpreted as a formula by Excel/Sheets — a scraped value
// like `=HYPERLINK("http://evil",…)` would execute on open. Prefix such cells
// with a single quote to neutralize them, but leave plain numbers (incl.
// negatives like -12.5) untouched so real data isn't mangled.
function neutralizeFormula(str: string): string {
  if (!/^[=+\-@\t\r]/.test(str)) return str;
  if (/^-?\d+(\.\d+)?$/.test(str)) return str; // pure number, safe
  return `'${str}`;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : String(value);
  const str = neutralizeFormula(raw);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvEscape).join(",");
}

/**
 * Build a full CSV document from headers + rows, prefixed with a UTF-8 BOM
 * so Excel opens it correctly without mojibake on Windows.
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [csvRow(headers)];
  for (const r of rows) lines.push(csvRow(r));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
