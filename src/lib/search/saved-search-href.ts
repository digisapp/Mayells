/**
 * Link back to a saved search's results, keeping its department. Shared by
 * the account list, the save button and the alert email, so a followed
 * department never drops out of the link.
 */
export function savedSearchHref(query: string, categoryId?: string | null): string {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (categoryId) params.set('department', categoryId);
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}
