import { db } from '@/db';
import { users } from '@/db/schema';
import { claimShadowUserByEmail } from '@/lib/sellers/shadow';

export type SignupRole = 'buyer' | 'seller';

/** Narrow untrusted auth metadata (user_metadata.role) to a signup role. */
export function roleFromMetadata(value: unknown): SignupRole {
  return value === 'seller' ? 'seller' : 'buyer';
}

/**
 * Ensure a profile row exists for an authenticated Supabase user, claiming any
 * shadow seller row that holds the same email.
 *
 * Only call this once the person has PROVEN they control the email address —
 * after the confirmation-link callback or a successful password sign-in.
 * Claiming re-points a consignor's lots and payouts at the caller's account,
 * so running it at signup time (email unproven, confirmation still pending)
 * would let anyone strand a consignor's records by typing their address.
 */
export async function ensureUserProfile(params: {
  id: string;
  email: string;
  fullName?: string | null;
  role?: SignupRole;
}): Promise<void> {
  const { id, email, fullName, role } = params;
  try {
    // onConflictDoNothing keeps this idempotent across logins and tolerates a
    // DB trigger that may already provision the profile from auth.users.
    await db
      .insert(users)
      .values({ id, email, fullName: fullName ?? null, role: role ?? 'buyer' })
      .onConflictDoNothing({ target: users.id });
  } catch (insertError) {
    // A unique-email conflict means a shadow seller row (a prospect consignor
    // we minted as seller-of-record) already holds this email — Supabase auth
    // would have rejected the signup if a real account owned it. Claim the
    // shadow row so their lots and payouts follow them.
    const claimed = await claimShadowUserByEmail({
      authUserId: id,
      email,
      fullName,
      role,
    }).catch(() => false);
    if (!claimed) throw insertError;
  }
}
