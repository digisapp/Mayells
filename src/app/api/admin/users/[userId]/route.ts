import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { users, lots, consignments, bids, invoices, payouts, emails, sellerProspects } from '@/db/schema';
import { eq, desc, or, sql } from 'drizzle-orm';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { logger } from '@/lib/logger';
import { applyUserUpdate } from '../guards';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const userDetailPatchSchema = z.object({
  role: z.enum(['buyer', 'seller', 'admin', 'auctioneer']).optional(),
  accountStatus: z.enum(['active', 'suspended', 'banned']).optional(),
  isAdmin: z.boolean().optional(),
  adminNotes: z.string().max(20_000).nullable().optional(),
  identityVerified: z.boolean().optional(),
  assignPaddle: z.literal(true).optional(),
});

function projectUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    isShadow: isSentinelEmail(u.email),
    fullName: u.fullName,
    displayName: u.displayName,
    role: u.role,
    isAdmin: u.isAdmin,
    accountStatus: u.accountStatus,
    cardVerifiedAt: u.cardVerifiedAt,
    identityVerifiedAt: u.identityVerifiedAt,
    paddleNumber: u.paddleNumber,
    phone: u.phone,
    companyName: u.companyName,
    shippingAddress: u.shippingAddress,
    shippingCity: u.shippingCity,
    shippingState: u.shippingState,
    shippingZip: u.shippingZip,
    shippingCountry: u.shippingCountry,
    adminNotes: u.adminNotes,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/**
 * GET /api/admin/users/[userId] — everything the person page needs in one
 * round trip: the projected profile, consignments & lots (as seller), bids &
 * invoices (as buyer), payouts, and the email history with this address.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { userId } = await params;
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const emailLower = user.email.toLowerCase();

    const [userConsignments, userLots, userBids, userInvoices, userPayouts, userEmails, prospectRows] = await Promise.all([
      db
        .select({
          id: consignments.id,
          title: consignments.title,
          status: consignments.status,
          estimatedValue: consignments.estimatedValue,
          categorySlug: consignments.categorySlug,
          lotId: consignments.lotId,
          reviewNotes: consignments.reviewNotes,
          createdAt: consignments.createdAt,
        })
        .from(consignments)
        .where(eq(consignments.sellerId, userId))
        .orderBy(desc(consignments.createdAt)),
      db
        .select({
          id: lots.id,
          lotNumber: lots.lotNumber,
          title: lots.title,
          status: lots.status,
          saleType: lots.saleType,
          estimateLow: lots.estimateLow,
          estimateHigh: lots.estimateHigh,
          hammerPrice: lots.hammerPrice,
          primaryImageUrl: lots.primaryImageUrl,
          createdAt: lots.createdAt,
        })
        .from(lots)
        .where(eq(lots.sellerId, userId))
        .orderBy(desc(lots.createdAt)),
      db
        .select({
          id: bids.id,
          amount: bids.amount,
          maxBidAmount: bids.maxBidAmount,
          bidType: bids.bidType,
          status: bids.status,
          createdAt: bids.createdAt,
          lotId: bids.lotId,
          lotTitle: lots.title,
          lotStatus: lots.status,
          lotNumber: lots.lotNumber,
        })
        .from(bids)
        .innerJoin(lots, eq(bids.lotId, lots.id))
        .where(eq(bids.bidderId, userId))
        .orderBy(desc(bids.createdAt))
        .limit(200),
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          hammerPrice: invoices.hammerPrice,
          totalAmount: invoices.totalAmount,
          dueDate: invoices.dueDate,
          paidAt: invoices.paidAt,
          createdAt: invoices.createdAt,
          lotId: invoices.lotId,
          lotTitle: lots.title,
        })
        .from(invoices)
        .innerJoin(lots, eq(invoices.lotId, lots.id))
        .where(eq(invoices.buyerId, userId))
        .orderBy(desc(invoices.createdAt)),
      db
        .select({
          id: payouts.id,
          status: payouts.status,
          hammerPrice: payouts.hammerPrice,
          commissionPercent: payouts.commissionPercent,
          commissionAmount: payouts.commissionAmount,
          netAmount: payouts.netAmount,
          method: payouts.method,
          reference: payouts.reference,
          paidAt: payouts.paidAt,
          createdAt: payouts.createdAt,
          lotId: payouts.lotId,
          lotTitle: lots.title,
        })
        .from(payouts)
        .innerJoin(lots, eq(payouts.lotId, lots.id))
        .where(eq(payouts.sellerId, userId))
        .orderBy(desc(payouts.createdAt)),
      isSentinelEmail(user.email)
        ? db
            .select({
              id: emails.id,
              direction: emails.direction,
              status: emails.status,
              subject: emails.subject,
              fromEmail: emails.fromEmail,
              toEmail: emails.toEmail,
              threadId: emails.threadId,
              aiAutoSent: emails.aiAutoSent,
              readAt: emails.readAt,
              createdAt: emails.createdAt,
            })
            .from(emails)
            .where(eq(emails.userId, userId))
            .orderBy(desc(emails.createdAt))
            .limit(100)
        : db
            .select({
              id: emails.id,
              direction: emails.direction,
              status: emails.status,
              subject: emails.subject,
              fromEmail: emails.fromEmail,
              toEmail: emails.toEmail,
              threadId: emails.threadId,
              aiAutoSent: emails.aiAutoSent,
              readAt: emails.readAt,
              createdAt: emails.createdAt,
            })
            .from(emails)
            .where(or(
              eq(emails.userId, userId),
              sql`lower(${emails.fromEmail}) = ${emailLower}`,
              sql`lower(${emails.toEmail}) = ${emailLower}`,
            ))
            .orderBy(desc(emails.createdAt))
            .limit(100),
      db
        .select({ id: sellerProspects.id, status: sellerProspects.status, fullName: sellerProspects.fullName })
        .from(sellerProspects)
        .where(eq(sellerProspects.userId, userId))
        .orderBy(desc(sellerProspects.createdAt))
        .limit(1),
    ]);

    const soldLots = userLots.filter((l) => l.status === 'sold');
    const stats = {
      lotCount: userLots.length,
      soldCount: soldLots.length,
      salesTotalCents: soldLots.reduce((sum, l) => sum + (l.hammerPrice ?? 0), 0),
      consignmentCount: userConsignments.length,
      bidCount: userBids.length,
      invoiceCount: userInvoices.length,
      purchasesTotalCents: userInvoices
        .filter((i) => i.status === 'paid')
        .reduce((sum, i) => sum + (i.totalAmount ?? 0), 0),
      payoutPendingCents: userPayouts
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => sum + (p.netAmount ?? 0), 0),
    };

    return NextResponse.json({
      data: {
        user: projectUser(user),
        stats,
        consignments: userConsignments,
        lots: userLots,
        bids: userBids,
        invoices: userInvoices,
        payouts: userPayouts,
        emails: userEmails,
        prospect: prospectRows[0] ?? null,
      },
    });
  } catch (error) {
    logger.error('Admin user detail error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users/[userId] — role / status / admin flag (same guards
 * as the list endpoint), internal notes, manual identity verification, and
 * paddle assignment.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { userId } = await params;
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const parsed = userDetailPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const result = await applyUserUpdate(admin.id, userId, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: projectUser(result.data) });
  } catch (error) {
    logger.error('Admin user detail update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
