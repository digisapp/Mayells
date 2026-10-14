/**
 * Parcel dimensions and weight are whole numbers in the database (inches,
 * pounds, ounces), and the shipments API accepts 0–100,000 or null.
 */
export const PARCEL_MAX = 100_000;

export const PARCEL_FIELDS = [
  { key: 'lengthIn', label: 'Length' },
  { key: 'widthIn', label: 'Width' },
  { key: 'heightIn', label: 'Height' },
  { key: 'weightLbs', label: 'Pounds' },
  { key: 'weightOz', label: 'Ounces' },
] as const;

export type ParcelKey = (typeof PARCEL_FIELDS)[number]['key'];

/**
 * One parcel input: blank clears the value (null); otherwise a whole number
 * from 0 to PARCEL_MAX. Anything else ("2.5", "abc", "-1") is undefined —
 * invalid, so the caller can refuse to save rather than erase what's stored.
 */
export function parseParcelField(value: string): number | null | undefined {
  const t = value.trim().replace(/,/g, '');
  if (!t) return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n <= PARCEL_MAX ? n : undefined;
}

/** All five fields, or the labels of the ones that aren't valid. */
export function parseParcel(
  form: Record<ParcelKey, string>,
): { ok: true; values: Record<ParcelKey, number | null> } | { ok: false; invalid: string[] } {
  const values = {} as Record<ParcelKey, number | null>;
  const invalid: string[] = [];
  for (const { key, label } of PARCEL_FIELDS) {
    const v = parseParcelField(form[key]);
    if (v === undefined) invalid.push(label);
    else values[key] = v;
  }
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, values };
}
