/**
 * Single source of truth for "is this profile an admin?".
 *
 * Two admin signals exist in the schema: `role === 'admin'` and the boolean
 * `is_admin`. The page middleware always treated EITHER as admin, but the API
 * routes historically checked only `role === 'admin'` — so a user with
 * `is_admin = true, role = 'buyer'` could load the admin UI while every save
 * returned 403. This predicate unifies both surfaces.
 *
 * Kept dependency-free (no db / server imports) so it is safe to use from the
 * edge middleware as well as server routes. Accepts either the Drizzle `users`
 * row shape (`isAdmin`) or the raw Supabase select shape (`is_admin`).
 */
export function isAdminProfile(
  profile:
    | {
        role?: string | null;
        isAdmin?: boolean | null;
        is_admin?: boolean | null;
        accountStatus?: string | null;
        account_status?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!profile) return false;
  // A suspended or banned admin loses admin access. Absent status (an older
  // cached middleware profile) counts as active; the DB default is 'active'.
  const status = profile.accountStatus ?? profile.account_status;
  if (status && status !== 'active') return false;
  return profile.role === 'admin' || profile.isAdmin === true || profile.is_admin === true;
}
