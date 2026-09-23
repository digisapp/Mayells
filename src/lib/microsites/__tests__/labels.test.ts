import { describe, expect, it } from 'vitest';
import { MICROSITES } from '../config';
import { MICROSITE_LABELS } from '../labels';

describe('MICROSITE_LABELS', () => {
  it('matches the microsite config exactly', () => {
    const fromConfig = Object.fromEntries(MICROSITES.map((m) => [m.slug, { city: m.city, domain: m.domain }]));
    expect(MICROSITE_LABELS).toEqual(fromConfig);
  });
});
