import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { isAdminProfile } from './admin';

/**
 * Shared admin authorization for server code. `isAdminProfile` (edge-safe)
 * stays the single predicate; these helpers add the session + profile lookup
 * so every page and API route answers "not an admin" the same way instead of
 * each carrying its own copy with a different status code.
 */

type AdminProfile = typeof users.$inferSelect;

async function loadAdminProfile(): Promise<AdminProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return profile && isAdminProfile(profile) ? profile : null;
}

/** For server components: redirects to the admin login when not an admin. */
export async function requireAdminPage(): Promise<AdminProfile> {
  const profile = await loadAdminProfile();
  if (!profile) redirect('/admin/login');
  return profile;
}

/**
 * For API routes. Returns the admin profile, or a ready-to-return response:
 * 401 when there is no session, 403 when the session is not an admin.
 */
export async function requireAdminApi(): Promise<
  { admin: AdminProfile; response: null } | { admin: null; response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { admin: null, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!profile || !isAdminProfile(profile)) {
    return { admin: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { admin: profile, response: null };
}
