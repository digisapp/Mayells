/**
 * Slug → display names for the city microsites, dependency-free so client
 * components (the admin prospects pages) can label a lead without bundling
 * the full page config. Kept in step with MICROSITES in ./config by
 * src/lib/microsites/__tests__/labels.test.ts.
 */
export const MICROSITE_LABELS: Record<string, { city: string; domain: string }> = {
  'delray-beach': { city: 'Delray Beach', domain: 'delraybeachauctions.com' },
  jupiter: { city: 'Jupiter', domain: 'jupiterauctions.com' },
  'west-palm-beach': { city: 'West Palm Beach', domain: 'westpalmauctions.com' },
  'winter-park': { city: 'Winter Park', domain: 'winterparkauctions.com' },
};

/** "Jupiter", or the raw slug for a site that has since been removed. */
export function micrositeCity(slug: string): string {
  return MICROSITE_LABELS[slug]?.city ?? slug;
}
