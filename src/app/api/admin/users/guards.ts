import { and, eq, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { redis, isRedisConfigured } from '@/lib/redis';
import { profileCacheKey } from '@/lib/auth/profile-cache';
import { ensurePaddleNumber } from '@/lib/bidding/verification';
import { isSentinelEmail } from '@/lib/sellers/sentinel';
import { logger } from '@/lib/logger';

/**
 * Shared by PATCH /api/admin/users and PATCH /api/admin/users/[userId]: the
 * account-safety guards (no self-lockout, never remove the last admin), the
 * write itself, and the middleware cache invalidation that makes a role or
 * status change take effect immediately instead of after the 300s TTL.
 */

// Only what the admin UI renders — never portalToken or Stripe ids.
export const userProjection = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  displayName: users.displayName,
  role: users.role,
  isAdmin: users.isAdmin,
  accountStatus: users.accountStatus,
  cardVerifiedAt: users.cardVerifiedAt,
  identityVerifiedAt: users.identityVerifiedAt,
  paddleNumber: users.paddleNumber,
  phone: users.phone,
  companyName: users.companyName,
  createdAt: users.createdAt,
};

export type UserRole = 'buyer' | 'seller' | 'admin' | 'auctioneer';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export interface UserUpdateInput {
  role?: UserRole;
  accountStatus?: AccountStatus;
  isAdmin?: boolean;
  adminNotes?: string | null;
  /** true → stamp identityVerifiedAt now; false → clear it */
  identityVerified?: boolean;
  /** true → assign a paddle number if the user has none */
  assignPaddle?: boolean;
}

export type UserUpdateResult =
  | { ok: true; data: typeof users.$inferSelect }
  | { ok: false; status: number; error: string };

function isAdminRow(row: { role: string; isAdmin: boolean }): boolean {
  return row.role === 'admin' || row.isAdmin === true;
}

export async function applyUserUpdate(
  actorId: string,
  targetId: string,
  input: UserUpdateInput,
): Promise<UserUpdateResult> {
  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return { ok: false, status: 404, error: 'User not found' };

  const isSelf = actorId === targetId;
  const roleChanging = input.role !== undefined && input.role !== target.role;
  const isAdminChanging = input.isAdmin !== undefined && input.isAdmin !== target.isAdmin;
  const statusChanging = input.accountStatus !== undefined && input.accountStatus !== target.accountStatus;

  // ── Self-lockout guards ──────────────────────────────────────────────────
  if (isSelf && statusChanging) {
    return { ok: false, status: 400, error: 'You cannot change your own account status' };
  }
  if (isSelf && (roleChanging || isAdminChanging)) {
    return { ok: false, status: 400, error: 'You cannot change your own admin access' };
  }

  // ── Last-admin guard ─────────────────────────────────────────────────────
  const nextRole = input.role ?? target.role;
  const nextIsAdmin = input.isAdmin ?? target.isAdmin;
  const nextStatus = input.accountStatus ?? target.accountStatus;
  const adminNow = isAdminRow(target);
  const adminAfter = nextRole === 'admin' || nextIsAdmin === true;
  const losesAdmin = adminNow && (!adminAfter || (nextStatus !== 'active' && target.accountStatus === 'active'));

  // Shadow consignor rows have no login; granting them admin would be a
  // dormant account with full access the moment its email is claimed.
  if (adminAfter && !adminNow && isSentinelEmail(target.email)) {
    return { ok: false, status: 422, error: 'Shadow accounts (no email on file) cannot be made admin' };
  }

  // ── Build the update ─────────────────────────────────────────────────────
  const updateData: Partial<typeof users.$inferInsert> = {};
  if (input.role !== undefined) updateData.role = input.role;
  if (input.accountStatus !== undefined) updateData.accountStatus = input.accountStatus;
  if (input.isAdmin !== undefined) updateData.isAdmin = input.isAdmin;
  if (input.adminNotes !== undefined) updateData.adminNotes = input.adminNotes?.trim() ? input.adminNotes : null;
  if (input.identityVerified !== undefined) {
    updateData.identityVerifiedAt = input.identityVerified ? new Date() : null;
  }

  if (Object.keys(updateData).length === 0 && !input.assignPaddle) {
    return { ok: false, status: 400, error: 'No valid fields to update' };
  }

  // Count and write under one transaction with an advisory lock, so two
  // admins demoting each other at the same instant can't both pass the
  // "someone else is still an admin" check and leave the house with none.
  const guard = await db.transaction(async (tx) => {
    if (losesAdmin) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('users:last-admin-guard'))`);
      const [{ others }] = await tx
        .select({ others: sql<number>`count(*)::int` })
        .from(users)
        .where(and(
          ne(users.id, targetId),
          eq(users.accountStatus, 'active'),
          or(eq(users.role, 'admin'), eq(users.isAdmin, true)),
        ));
      if (others === 0) {
        return {
          ok: false as const,
          status: 400,
          error: 'This is the only remaining admin — promote someone else before demoting, suspending, or banning them',
        };
      }
    }
    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = new Date();
      await tx.update(users).set(updateData).where(eq(users.id, targetId));
    }
    return { ok: true as const };
  });
  if (!guard.ok) return guard;

  if (input.assignPaddle) {
    await ensurePaddleNumber(targetId);
  }

  // The middleware caches role/status for 300s — drop it so the change bites
  // on the target's very next request. Best effort.
  if ((roleChanging || isAdminChanging || statusChanging) && isRedisConfigured) {
    try {
      await redis.del(profileCacheKey(targetId));
    } catch (err) {
      logger.error('Failed to drop middleware profile cache', err, { userId: targetId });
    }
  }

  const [updated] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  return { ok: true, data: updated };
}
