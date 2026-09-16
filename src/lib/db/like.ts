/**
 * Escape the ILIKE/LIKE wildcards in user-supplied search text so a query
 * like "100%" or "a_b" matches literally instead of as a pattern. Pair with
 * the default backslash escape character (Postgres `standard_conforming_strings`).
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** `%term%` with the wildcards inside `term` escaped. */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`;
}
