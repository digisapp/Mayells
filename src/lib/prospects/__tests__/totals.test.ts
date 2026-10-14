import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { acceptedTotalsSelect, reviewCountsSelect } from '../totals';

const dialect = new PgDialect();
const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) => dialect.sqlToQuery(fragment).sql;

describe('prospect totals', () => {
  it('sums estimates as bigint and clamps to the int4 column before the cast', () => {
    const low = render(acceptedTotalsSelect().totalEstimateLow);
    expect(low).toBe(
      'least(coalesce(sum(coalesce("upload_items"."final_estimate_low", "upload_items"."ai_estimate_low")::bigint), 0::bigint), 2147483647::bigint)::int',
    );
  });

  it('keeps the declined filter inside the clamp', () => {
    const high = render(reviewCountsSelect().totalEstimateHigh);
    expect(high).toBe(
      'least(coalesce(sum(coalesce("upload_items"."final_estimate_high", "upload_items"."ai_estimate_high")::bigint) filter (where "upload_items"."upload_item_status" != \'declined\'), 0::bigint), 2147483647::bigint)::int',
    );
  });
});
