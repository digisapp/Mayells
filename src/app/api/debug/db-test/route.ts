import { NextResponse } from 'next/server';
import { db } from '@/db';
import { lots, auctions, users, outreachContacts, consignments, estateVisits } from '@/db/schema';
import { sql, desc } from 'drizzle-orm';

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test each query individually
  const tests = [
    ['lots_count', () => db.select({ count: sql<number>`count(*)` }).from(lots)],
    ['auctions_count', () => db.select({ count: sql<number>`count(*)` }).from(auctions)],
    ['users_count', () => db.select({ count: sql<number>`count(*)` }).from(users)],
    ['active_lots', () => db.select({ count: sql<number>`count(*) filter (where ${lots.status} in ('for_sale', 'in_auction'))` }).from(lots)],
    ['active_auctions', () => db.select({ count: sql<number>`count(*) filter (where ${auctions.status} in ('open', 'live', 'preview'))` }).from(auctions)],
    ['outreach_count', () => db.select({ count: sql<number>`count(*)` }).from(outreachContacts)],
    ['appraisal_count', () => db.select({ count: sql<number>`count(*)` }).from(estateVisits)],
    ['recent_consignments', () => db.select({ id: consignments.id, title: consignments.title, status: consignments.status }).from(consignments).orderBy(desc(consignments.createdAt)).limit(5)],
    ['recent_appraisals', () => db.select({ id: estateVisits.id, clientName: estateVisits.clientName, status: estateVisits.status }).from(estateVisits).orderBy(desc(estateVisits.createdAt)).limit(5)],
  ] as const;

  for (const [name, fn] of tests) {
    try {
      const r = await (fn as () => Promise<unknown>)();
      results[name] = { ok: true, data: r };
    } catch (e) {
      results[name] = { ok: false, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 3) : undefined };
    }
  }

  return NextResponse.json(results);
}
