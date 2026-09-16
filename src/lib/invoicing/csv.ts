/** Minimal RFC-4180 CSV writer for admin exports. */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  // Neutralise spreadsheet formula injection on user-supplied text.
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Cents → "1234.56" for spreadsheets (no currency symbol). */
export function centsToDecimal(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}
