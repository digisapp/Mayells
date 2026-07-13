import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Tiered bidder verification. Friction scales with the money at stake:
 *
 *  - Tier 1 (registered): email-verified account. May bid up to TIER1_MAX_BID.
 *  - Tier 2 (card-verified): a valid card on file (Stripe SetupIntent, no
 *    charge). Unlocks normal bidding up to CARD_MAX_BID.
 *  - Tier 3 (identity-verified): government ID (Stripe Identity). Required for
 *    bids at/above CARD_MAX_BID.
 *
 * All amounts are integer cents to match the rest of the money path.
 */
export const TIER1_MAX_BID = 100_000; // $1,000 — bid ceiling for email-only accounts
export const CARD_MAX_BID = 2_500_000; // $25,000 — above this, identity is required

export type BidderTier = 'registered' | 'card' | 'identity';

export interface BidderVerification {
  tier: BidderTier;
  cardVerified: boolean;
  identityVerified: boolean;
  /** Highest bid (cents) this bidder may currently place. */
  maxBidAllowed: number;
}

export function tierFromFlags(cardVerified: boolean, identityVerified: boolean): BidderVerification {
  const tier: BidderTier = identityVerified ? 'identity' : cardVerified ? 'card' : 'registered';
  // maxBidAllowed must match checkBidAllowed's boundaries exactly, or the UI
  // advertises a ceiling the gate then rejects. The card tier is blocked at
  // `>= CARD_MAX_BID`, so its true ceiling is one cent below.
  const maxBidAllowed =
    tier === 'identity'
      ? Number.MAX_SAFE_INTEGER
      : tier === 'card'
        ? CARD_MAX_BID - 1
        : TIER1_MAX_BID;
  return { tier, cardVerified, identityVerified, maxBidAllowed };
}

export async function getBidderVerification(userId: string): Promise<BidderVerification> {
  const [row] = await db
    .select({ cardVerifiedAt: users.cardVerifiedAt, identityVerifiedAt: users.identityVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return tierFromFlags(!!row?.cardVerifiedAt, !!row?.identityVerifiedAt);
}

export interface BidGateResult {
  allowed: boolean;
  /** Verification tier the bidder must reach to place this bid. */
  requiredTier?: BidderTier;
  reason?: string;
}

/**
 * Decide whether a bidder at a given verification level may place a bid of
 * `amountCents`. Pure so it can be unit-tested against the tier thresholds.
 */
export function checkBidAllowed(v: BidderVerification, amountCents: number): BidGateResult {
  if (amountCents >= CARD_MAX_BID && !v.identityVerified) {
    return {
      allowed: false,
      requiredTier: 'identity',
      reason: `Bids of $${(CARD_MAX_BID / 100).toLocaleString()} or more require identity verification.`,
    };
  }
  if (amountCents > TIER1_MAX_BID && !v.cardVerified) {
    return {
      allowed: false,
      requiredTier: 'card',
      reason: `Bids over $${(TIER1_MAX_BID / 100).toLocaleString()} require a verified card on file.`,
    };
  }
  return { allowed: true };
}

/**
 * Assign a unique paddle number to a bidder the first time they clear card
 * verification, if they don't already have one. Best-effort and idempotent:
 * retries on the (rare) unique-collision, and never throws into the caller.
 */
export async function ensurePaddleNumber(userId: string): Promise<string | null> {
  try {
    const [existing] = await db
      .select({ paddleNumber: users.paddleNumber })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (existing?.paddleNumber) return existing.paddleNumber;

    for (let attempt = 0; attempt < 5; attempt++) {
      // 5-digit paddle in [10000, 99999]; derived server-side, collision-checked
      // by the unique index on users.paddleNumber.
      const candidate = String(10000 + Math.floor(Math.random() * 90000));
      try {
        const [updated] = await db
          .update(users)
          .set({ paddleNumber: candidate, updatedAt: new Date() })
          .where(and_notSet(userId))
          .returning({ paddleNumber: users.paddleNumber });
        if (updated?.paddleNumber) return updated.paddleNumber;
        // Row already had a paddle (set concurrently) — read and return it.
        const [row] = await db
          .select({ paddleNumber: users.paddleNumber })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        return row?.paddleNumber ?? null;
      } catch (err) {
        // Unique collision on the candidate — try another.
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    logger.warn('Could not assign paddle number after retries', { userId });
    return null;
  } catch (err) {
    logger.error('ensurePaddleNumber failed', err, { userId });
    return null;
  }
}

// Update only when the paddle is still unset, so we never overwrite an existing
// paddle and two concurrent calls can't both assign.
function and_notSet(userId: string) {
  return sql`${users.id} = ${userId} AND ${users.paddleNumber} IS NULL`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505'
  );
}
