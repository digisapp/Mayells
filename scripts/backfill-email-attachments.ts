import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { Resend } from 'resend';
import { emails } from '../src/db/schema/emails';

// One-time backfill: populate emails.attachments metadata for inbound emails
// stored before the webhook started recording it (2026-08-02).
// Usage: npx tsx scripts/backfill-email-attachments.ts

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const db = drizzle(sql);
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const rows = await db
    .select({ id: emails.id, resendId: emails.resendId })
    .from(emails)
    .where(and(
      eq(emails.direction, 'inbound'),
      isNotNull(emails.resendId),
      isNull(emails.attachments),
    ));

  console.log(`${rows.length} inbound emails to check`);
  let updated = 0;

  for (const row of rows) {
    try {
      const { data: full } = await resend.emails.receiving.get(row.resendId!);
      const meta = (full?.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.filename || 'attachment',
        size: a.size,
        contentType: a.content_type,
      }));
      if (meta.length > 0) {
        await db.update(emails).set({ attachments: meta }).where(eq(emails.id, row.id));
        updated++;
        console.log(`  ${row.id}: ${meta.length} attachment(s) — ${meta.map((m) => m.filename).join(', ')}`);
      }
    } catch (err) {
      console.warn(`  ${row.id}: fetch failed (${err instanceof Error ? err.message : err})`);
    }
    // Stay well under Resend's rate limit
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`Done. ${updated} emails updated.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
