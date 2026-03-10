import { NextResponse } from 'next/server';
import postgres from 'postgres';

export async function GET() {
  const url = process.env.DATABASE_URL;
  const results: Record<string, unknown> = {
    url_exists: !!url,
    url_length: url?.length,
    url_preview: url ? url.substring(0, 30) + '...' + url.substring(url.length - 20) : null,
  };

  // Test raw postgres connection (bypass Drizzle)
  try {
    const sql = postgres(url!, { prepare: false, ssl: 'require', max: 1, connect_timeout: 10 });
    const r = await sql`SELECT count(*) as cnt FROM lots`;
    results.raw_query = { ok: true, count: r[0].cnt };
    await sql.end();
  } catch (e) {
    results.raw_query = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      name: e instanceof Error ? e.name : undefined,
      cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
    };
  }

  // Test Drizzle connection
  try {
    const { db } = await import('@/db');
    const { sql } = await import('drizzle-orm');
    const { lots } = await import('@/db/schema');
    const r = await db.select({ count: sql<number>`count(*)` }).from(lots);
    results.drizzle_query = { ok: true, count: r[0].count };
  } catch (e) {
    results.drizzle_query = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      name: e instanceof Error ? e.name : undefined,
      cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
    };
  }

  return NextResponse.json(results);
}
