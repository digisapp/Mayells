import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bestAuctionSlugSql } from '../auction-slug';

describe('bestAuctionSlugSql', () => {
  const { sql, params } = new PgDialect().sqlToQuery(bestAuctionSlugSql.sql);

  it('only ever picks a public sale', () => {
    expect(sql).toMatch(/a\.status in \(\$1(, \$\d+)*\)/);
    expect(params).toContain('scheduled');
    expect(params).toContain('completed');
    expect(params).not.toContain('draft');
    expect(params).not.toContain('cancelled');
  });

  it('correlates on the outer lots row by its qualified id', () => {
    expect(sql).toContain('al.lot_id = "lots"."id"');
  });
});
