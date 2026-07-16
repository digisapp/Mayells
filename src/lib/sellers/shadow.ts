/**
 * Shadow seller accounts — the seller-of-record for prospect consignors who
 * never created an account. Lots, shipments, and payouts all require a
 * users row to point at; a prospect's lots were previously created with
 * sellerId = null, which broke shipment creation and made payouts impossible.
 *
 * A shadow user is a plain users row (role 'seller') with no Supabase auth
 * behind it. If the consignor later signs up with the same email, the signup
 * route claims the shadow row via claimShadowUserByEmail.
 */

import { randomUUID } from 'crypto';
import { eq, sql, and, ne } from 'drizzle-orm';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { db } from '@/db';
import { users, lots, consignments, shipments, payouts, sellerProspects, type SellerProspect } from '@/db/schema';
import { logger } from '@/lib/logger';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;

// Prospects can be created without an email (phone/walk-in). The users table
// requires a unique email, so shadow rows for them get a sentinel address.
// Anything under this domain must never be emailed.
export const SHADOW_EMAIL_DOMAIN = 'no-email.mayells.invalid';

export function isSentinelEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${SHADOW_EMAIL_DOMAIN}`);
}

/**
 * Resolve (or create) the seller-of-record users row for a prospect and link
 * it via seller_prospects.user_id. Returns the user id. Runs inside the
 * caller's transaction so lot creation and seller minting commit together.
 */
export async function ensureProspectSellerUser(tx: DbOrTx, prospect: SellerProspect): Promise<string> {
  if (prospect.userId) return prospect.userId;

  // If an account already exists for the prospect's email, that IS the seller —
  // link it rather than minting a duplicate.
  if (prospect.email) {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${prospect.email})`)
      .limit(1);
    if (existing) {
      await tx
        .update(sellerProspects)
        .set({ userId: existing.id, updatedAt: new Date() })
        .where(eq(sellerProspects.id, prospect.id));
      return existing.id;
    }
  }

  const id = randomUUID();
  const email = prospect.email ?? `prospect-${prospect.id}@${SHADOW_EMAIL_DOMAIN}`;

  await tx.insert(users).values({
    id,
    email,
    fullName: prospect.fullName,
    role: 'seller',
    phone: prospect.phone,
    companyName: prospect.company,
    // The prospect's address doubles as the ship-from address used by the
    // shipping service.
    shippingAddress: prospect.address,
    shippingCity: prospect.city,
    shippingState: prospect.state,
    shippingZip: prospect.zip,
    shippingCountry: prospect.country ?? 'US',
  });

  await tx
    .update(sellerProspects)
    .set({ userId: id, updatedAt: new Date() })
    .where(eq(sellerProspects.id, prospect.id));

  logger.info('Minted shadow seller user for prospect', { prospectId: prospect.id, userId: id });
  return id;
}

/**
 * Called when a signup hits a users.email unique conflict: if the existing row
 * is a shadow seller (it has our email but a different id, and Supabase auth
 * accepted the signup — so no real account owns that email), move its
 * seller-side references to the new auth user and tombstone the shadow row.
 *
 * Returns true if a shadow row was claimed.
 */
export async function claimShadowUserByEmail(params: {
  authUserId: string;
  email: string;
  fullName?: string | null;
  role?: 'buyer' | 'seller';
}): Promise<boolean> {
  const { authUserId, email, fullName, role } = params;

  const [shadow] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = lower(${email})`, ne(users.id, authUserId)))
    .limit(1);
  if (!shadow) return false;

  // A row is only claimable if it is genuinely ours-without-auth: shadow rows
  // are never present in Supabase auth. If auth knows this id, it's a real
  // account — never touch it. Fail closed on any lookup error.
  try {
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: authUser, error } = await adminClient.auth.admin.getUserById(shadow.id);
    if (authUser?.user) {
      logger.error('Refusing to claim: email conflict with a REAL auth-backed account', undefined, {
        existingUserId: shadow.id,
        authUserId,
      });
      return false;
    }
    // "User not found" (404) is the expected result for a shadow row; any
    // other error means we couldn't verify — fail closed.
    if (error && error.status !== 404) return false;
  } catch {
    return false;
  }

  return db.transaction(async (tx) => {

    // Free the email, keep the row as an inert tombstone (deleting it could
    // trip FK references we don't know about).
    await tx
      .update(users)
      .set({ email: `claimed-${shadow.id}@${SHADOW_EMAIL_DOMAIN}`, updatedAt: new Date() })
      .where(eq(users.id, shadow.id));

    await tx.insert(users).values({
      id: authUserId,
      email,
      fullName: fullName ?? shadow.fullName,
      // A consignor claiming their shadow account stays a seller even if the
      // signup form defaulted to buyer.
      role: shadow.role === 'seller' ? 'seller' : (role ?? 'buyer'),
      phone: shadow.phone,
      companyName: shadow.companyName,
      shippingAddress: shadow.shippingAddress,
      shippingCity: shadow.shippingCity,
      shippingState: shadow.shippingState,
      shippingZip: shadow.shippingZip,
      shippingCountry: shadow.shippingCountry,
    });

    // Re-point every seller-side reference a shadow row can hold.
    await tx.update(lots).set({ sellerId: authUserId }).where(eq(lots.sellerId, shadow.id));
    await tx.update(consignments).set({ sellerId: authUserId }).where(eq(consignments.sellerId, shadow.id));
    await tx.update(shipments).set({ sellerId: authUserId }).where(eq(shipments.sellerId, shadow.id));
    await tx.update(payouts).set({ sellerId: authUserId }).where(eq(payouts.sellerId, shadow.id));
    await tx.update(sellerProspects).set({ userId: authUserId }).where(eq(sellerProspects.userId, shadow.id));

    logger.info('Shadow seller claimed by new account', { shadowId: shadow.id, authUserId });
    return true;
  });
}
