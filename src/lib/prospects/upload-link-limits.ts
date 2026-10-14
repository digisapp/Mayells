export interface UploadLinkLimitOptions {
  /** Most items the link takes in total; null for no limit. */
  maxItems?: number | null;
  /** Days from now until the link stops working; null for never. */
  expiresInDays?: number | null;
}

/** When a link made (or renewed) now with these options expires. */
export function expiryFrom(now: Date, expiresInDays: number | null | undefined): Date | null {
  if (!expiresInDays) return null;
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt;
}

/**
 * The limits to write onto a link being reused, or null when it already
 * matches. An option left out keeps the link's current value; null clears
 * the limit; an expiry counts from now, so a resend renews it.
 */
export function limitChanges(
  link: { maxItems: number | null; expiresAt: Date | null },
  options: UploadLinkLimitOptions,
  now: Date,
): { maxItems?: number | null; expiresAt?: Date | null } | null {
  const changes: { maxItems?: number | null; expiresAt?: Date | null } = {};
  if (options.maxItems !== undefined && options.maxItems !== link.maxItems) changes.maxItems = options.maxItems;
  if (options.expiresInDays !== undefined) {
    const expiresAt = expiryFrom(now, options.expiresInDays);
    if (expiresAt?.getTime() !== link.expiresAt?.getTime()) changes.expiresAt = expiresAt;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
