import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users } from '../src/db/schema/users';

const EMAIL = 'admin@mayells.com';
const PASSWORD = 'Test#123';
const FULL_NAME = 'Mayells Admin';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const sql = postgres(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Create Supabase auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    console.error('Auth error:', authError.message);
    await sql.end();
    process.exit(1);
  }

  console.log(`Auth user created: ${authData.user.id}`);

  // Create user profile with admin role
  await db.insert(users).values({
    id: authData.user.id,
    email: EMAIL,
    fullName: FULL_NAME,
    role: 'admin',
    isAdmin: true,
  });

  console.log(`Admin profile created: ${EMAIL}`);
  console.log('Done! You can now log in at /auth/login');

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
