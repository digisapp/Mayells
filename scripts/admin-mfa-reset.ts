import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema/users';

// Lockout recovery: remove every MFA factor from an account so its owner can
// sign in with password alone and re-enroll from /admin/security.
// Usage: npx tsx scripts/admin-mfa-reset.ts admin@mayells.com

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx scripts/admin-mfa-reset.ts <email>');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!);
  const db = drizzle(sql);
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    console.error(`No user with email ${email}`);
    await sql.end();
    process.exit(1);
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: row.id });
  if (error) throw error;
  const factors = data?.factors ?? [];
  for (const f of factors) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: row.id });
    if (delErr) throw delErr;
    console.log(`Removed factor ${f.id} (${f.factor_type}, ${f.status})`);
  }
  console.log(factors.length === 0 ? 'No factors to remove.' : `Done — ${factors.length} factor(s) removed. Middleware cache clears within 5 minutes.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
