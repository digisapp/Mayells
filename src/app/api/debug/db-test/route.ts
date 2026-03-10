import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, unknown> = {};

  const { db } = await import('@/db');
  const { sql, desc, eq } = await import('drizzle-orm');
  const schema = await import('@/db/schema');

  const tests: [string, () => Promise<unknown>][] = [
    ['lots', () => db.select({ count: sql<number>`count(*)` }).from(schema.lots)],
    ['auctions', () => db.select({ count: sql<number>`count(*)` }).from(schema.auctions)],
    ['users', () => db.select({ count: sql<number>`count(*)` }).from(schema.users)],
    ['outreach', () => db.select({ count: sql<number>`count(*)` }).from(schema.outreachContacts)],
    ['consignments', () => db.select({ count: sql<number>`count(*)` }).from(schema.consignments)],
    ['estate_visits', () => db.select({ count: sql<number>`count(*)` }).from(schema.estateVisits)],
    ['categories', () => db.select({ count: sql<number>`count(*)` }).from(schema.categories)],
    ['invoices', () => db.select({ count: sql<number>`count(*)` }).from(schema.invoices)],
    ['lots_join_cat', () => db.select({ lot: schema.lots, category: schema.categories }).from(schema.lots).leftJoin(schema.categories, eq(schema.lots.categoryId, schema.categories.id)).limit(1)],
  ];

  for (const [name, fn] of tests) {
    try {
      const r = await fn();
      results[name] = { ok: true, result: JSON.stringify(r).slice(0, 200) };
    } catch (e) {
      results[name] = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
      };
    }
  }

  return NextResponse.json(results);
}
