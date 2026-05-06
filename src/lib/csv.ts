/**
 * Minimal CSV encoder.
 * Quotes any cell that contains a comma, double-quote, or newline.
 * Doubles up internal double-quotes (RFC 4180).
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
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
