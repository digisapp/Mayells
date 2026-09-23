import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { alias } from 'drizzle-orm/pg-core';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { db } from '@/db';
import {
  shipments,
  users,
  lots,
  invoices,
  auctionLots,
  shipmentStatusEnum,
  carrierEnum,
  shippingMethodEnum,
} from '@/db/schema';
import { eq, and, desc, sql, inArray, ilike, or, type SQL } from 'drizzle-orm';
import {
  canTransition,
  SHIPMENT_STATUS_BUCKETS,
  SHIPPED_STATUSES,
  type ShipmentBucket,
} from '@/lib/shipping/transitions';
import { notifyBuyerShipped } from '@/lib/shipping/service';
import { logger } from '@/lib/logger';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalInt = z.number().int().min(0).max(100000).nullable().optional();

const addressSchema = z
  .object({
    name: optionalText(200),
    phone: optionalText(50),
    email: optionalText(200),
    street: optionalText(300),
    street2: optionalText(300),
    city: optionalText(120),
    state: optionalText(120),
    zip: optionalText(30),
    country: optionalText(2),
  })
  .optional();

const shipmentPatchSchema = z.object({
  id: z.string().uuid('Valid shipment ID required'),
  status: z.enum(shipmentStatusEnum.enumValues).optional(),
  method: z.enum(shippingMethodEnum.enumValues).optional(),
  carrier: z.enum(carrierEnum.enumValues).nullable().optional(),
  trackingNumber: z.string().trim().max(255).optional(),
  trackingUrl: z.string().trim().url('Valid tracking URL required').max(2048).or(z.literal('')).optional(),
  internalNotes: z.string().trim().max(5000).optional(),
  // The notes as the form loaded them. Refunds append recall warnings to a
  // shipment's notes, so a save from a sheet opened earlier must not erase them.
  internalNotesBase: z.string().max(5000).optional(),
  weightLbs: optionalInt,
  weightOz: optionalInt,
  lengthIn: optionalInt,
  widthIn: optionalInt,
  heightIn: optionalInt,
  from: addressSchema,
  to: addressSchema,
});

const PAGE_SIZE = 50;

const buyer = alias(users, 'buyer');
const seller = alias(users, 'seller');

// GET /api/admin/shipments?page=1&status=<bucket>&q=
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const offset = (page - 1) * PAGE_SIZE;
    const statusParam = sp.get('status');
    const bucket = statusParam && Object.hasOwn(SHIPMENT_STATUS_BUCKETS, statusParam)
      ? SHIPMENT_STATUS_BUCKETS[statusParam as ShipmentBucket]
      : undefined;
    // `q` is canonical; `search` kept as an alias for older links.
    const search = (sp.get('q') ?? sp.get('search'))?.trim().slice(0, 200) || null;

    const conditions: SQL[] = [];
    if (bucket) conditions.push(inArray(shipments.status, [...bucket]));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(shipments.trackingNumber, pattern),
          ilike(shipments.toName, pattern),
          ilike(buyer.fullName, pattern),
          ilike(buyer.email, pattern),
          ilike(lots.title, pattern),
          ilike(invoices.invoiceNumber, pattern),
        )!,
      );
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const base = () =>
      db
        .select({
          shipment: {
            id: shipments.id,
            status: shipments.status,
            method: shipments.method,
            carrier: shipments.carrier,
            trackingNumber: shipments.trackingNumber,
            trackingUrl: shipments.trackingUrl,
            labelUrl: shipments.labelUrl,
            shippingCost: shipments.shippingCost,
            insuranceCost: shipments.insuranceCost,
            insuranceValue: shipments.insuranceValue,
            weightLbs: shipments.weightLbs,
            weightOz: shipments.weightOz,
            lengthIn: shipments.lengthIn,
            widthIn: shipments.widthIn,
            heightIn: shipments.heightIn,
            fromName: shipments.fromName,
            fromPhone: shipments.fromPhone,
            fromEmail: shipments.fromEmail,
            fromStreet: shipments.fromStreet,
            fromStreet2: shipments.fromStreet2,
            fromCity: shipments.fromCity,
            fromState: shipments.fromState,
            fromZip: shipments.fromZip,
            fromCountry: shipments.fromCountry,
            toName: shipments.toName,
            toPhone: shipments.toPhone,
            toEmail: shipments.toEmail,
            toStreet: shipments.toStreet,
            toStreet2: shipments.toStreet2,
            toCity: shipments.toCity,
            toState: shipments.toState,
            toZip: shipments.toZip,
            toCountry: shipments.toCountry,
            internalNotes: shipments.internalNotes,
            shippedAt: shipments.shippedAt,
            deliveredAt: shipments.deliveredAt,
            buyerNotifiedAt: shipments.buyerNotifiedAt,
            sellerNotifiedAt: shipments.sellerNotifiedAt,
            createdAt: shipments.createdAt,
          },
          seller: { id: seller.id, fullName: seller.fullName, email: seller.email },
          buyer: { id: buyer.id, fullName: buyer.fullName, email: buyer.email },
          lot: { id: lots.id, title: lots.title, lotNumber: auctionLots.lotNumber },
          invoice: { id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status },
        })
        .from(shipments)
        .innerJoin(seller, eq(shipments.sellerId, seller.id))
        .innerJoin(buyer, eq(shipments.buyerId, buyer.id))
        .innerJoin(lots, eq(shipments.lotId, lots.id))
        .innerJoin(invoices, eq(shipments.invoiceId, invoices.id))
        .leftJoin(
          auctionLots,
          and(eq(auctionLots.auctionId, invoices.auctionId), eq(auctionLots.lotId, invoices.lotId)),
        );

    const [items, countResult, statusRows] = await Promise.all([
      base().where(whereClause).orderBy(desc(shipments.createdAt)).limit(PAGE_SIZE).offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(shipments)
        .innerJoin(buyer, eq(shipments.buyerId, buyer.id))
        .innerJoin(lots, eq(shipments.lotId, lots.id))
        .innerJoin(invoices, eq(shipments.invoiceId, invoices.id))
        .where(whereClause),
      // Global (not page- or filter-scoped) numbers for the header summary
      db
        .select({ status: shipments.status, count: sql<number>`count(*)::int` })
        .from(shipments)
        .groupBy(shipments.status),
    ]);

    const total = countResult[0]?.count ?? 0;
    const countIn = (statuses: readonly string[]) =>
      statusRows.reduce((sum, r) => (statuses.includes(r.status) ? sum + r.count : sum), 0);
    const stats = {
      pending: countIn(SHIPMENT_STATUS_BUCKETS.pending),
      needsAddress: countIn(SHIPMENT_STATUS_BUCKETS.needs_address),
      inTransit: countIn(SHIPMENT_STATUS_BUCKETS.in_transit),
      delivered: countIn(SHIPMENT_STATUS_BUCKETS.delivered),
      // exception / returned are problems, never "completed"
      exception: countIn(SHIPMENT_STATUS_BUCKETS.exception),
      cancelled: countIn(SHIPMENT_STATUS_BUCKETS.cancelled),
    };

    return NextResponse.json({
      data: items,
      stats,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (error) {
    logger.error('Admin shipments error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/shipments — status (validated transitions), addresses,
// parcel, carrier/tracking, notes
export async function PATCH(request: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = shipmentPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const body = parsed.data;
    const [existing] = await db.select().from(shipments).where(eq(shipments.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

    const now = new Date();
    const updates: Partial<typeof shipments.$inferInsert> = { updatedAt: now };

    // --- Fields -------------------------------------------------------------
    if (body.method !== undefined) updates.method = body.method;
    if (body.carrier !== undefined) updates.carrier = body.carrier;
    if (body.trackingNumber !== undefined) updates.trackingNumber = body.trackingNumber || null;
    if (body.trackingUrl !== undefined) updates.trackingUrl = body.trackingUrl || null;
    if (
      body.internalNotes !== undefined &&
      body.internalNotesBase !== undefined &&
      body.internalNotesBase.trim() !== (existing.internalNotes ?? '').trim()
    ) {
      return NextResponse.json(
        { error: 'The notes on this shipment changed since you opened it. Reopen it to see the latest before saving.' },
        { status: 409 },
      );
    }
    if (body.internalNotes !== undefined) updates.internalNotes = body.internalNotes || null;
    for (const key of ['weightLbs', 'weightOz', 'lengthIn', 'widthIn', 'heightIn'] as const) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.from) {
      const f = body.from;
      if (f.name !== undefined && f.name) updates.fromName = f.name;
      if (f.phone !== undefined) updates.fromPhone = f.phone || null;
      if (f.email !== undefined) updates.fromEmail = f.email || null;
      if (f.street !== undefined) updates.fromStreet = f.street || null;
      if (f.street2 !== undefined) updates.fromStreet2 = f.street2 || null;
      if (f.city !== undefined) updates.fromCity = f.city || null;
      if (f.state !== undefined) updates.fromState = f.state || null;
      if (f.zip !== undefined) updates.fromZip = f.zip || null;
      if (f.country !== undefined && f.country) updates.fromCountry = f.country.toUpperCase();
    }
    if (body.to) {
      const t = body.to;
      if (t.name !== undefined && t.name) updates.toName = t.name;
      if (t.phone !== undefined) updates.toPhone = t.phone || null;
      if (t.email !== undefined) updates.toEmail = t.email || null;
      if (t.street !== undefined) updates.toStreet = t.street || null;
      if (t.street2 !== undefined) updates.toStreet2 = t.street2 || null;
      if (t.city !== undefined) updates.toCity = t.city || null;
      if (t.state !== undefined) updates.toState = t.state || null;
      if (t.zip !== undefined) updates.toZip = t.zip || null;
      if (t.country !== undefined && t.country) updates.toCountry = t.country.toUpperCase();
    }

    // --- Status -------------------------------------------------------------
    let nextStatus = body.status ?? existing.status;

    // A destination that just became complete lifts needs_address automatically.
    const toStreet = updates.toStreet !== undefined ? updates.toStreet : existing.toStreet;
    const toZip = updates.toZip !== undefined ? updates.toZip : existing.toZip;
    if ((!body.status || body.status === existing.status) && existing.status === 'needs_address' && toStreet && toZip) {
      nextStatus = 'pending';
    }

    if (nextStatus !== existing.status) {
      if (!canTransition(existing.status, nextStatus)) {
        return NextResponse.json(
          { error: `Cannot move a shipment from "${existing.status.replace(/_/g, ' ')}" to "${nextStatus.replace(/_/g, ' ')}"` },
          { status: 409 },
        );
      }
      if (nextStatus === 'exception') {
        const note = body.internalNotes?.trim();
        if (!note || note === (existing.internalNotes ?? '').trim()) {
          return NextResponse.json(
            { error: 'Describe the problem in the internal notes when marking a shipment as an exception' },
            { status: 400 },
          );
        }
      }
      updates.status = nextStatus;
      if ((nextStatus === 'picked_up' || nextStatus === 'in_transit') && !existing.shippedAt) {
        updates.shippedAt = now;
      }
      if (nextStatus === 'delivered') updates.deliveredAt = now;
      if (nextStatus === 'label_created' && !existing.labelCreatedAt) updates.labelCreatedAt = now;
    }

    const [updated] = await db
      .update(shipments)
      .set(updates)
      .where(eq(shipments.id, body.id))
      .returning();
    if (!updated) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

    // Keep the invoice's tracking number in step.
    if (updated.trackingNumber && updated.trackingNumber !== existing.trackingNumber) {
      await db
        .update(invoices)
        .set({ trackingNumber: updated.trackingNumber, updatedAt: now })
        .where(eq(invoices.id, updated.invoiceId));
    }

    // Buyer "it's on the way" email: when tracking is first saved, or the
    // status first moves to picked up / in transit — with tracking present.
    // Once per shipment (buyer_notified_at) and gated by automation settings.
    const trackingJustSet = !existing.trackingNumber && !!updated.trackingNumber;
    const nowShipped = SHIPPED_STATUSES.includes(updated.status);
    const statusJustShipped = nowShipped && !SHIPPED_STATUSES.includes(existing.status);
    let buyerNotified = false;
    if (updated.trackingNumber && nowShipped && (trackingJustSet || statusJustShipped) && !updated.buyerNotifiedAt) {
      buyerNotified = await notifyBuyerShipped(updated.id);
    }

    return NextResponse.json({ data: updated, buyerNotified });
  } catch (error) {
    logger.error('Admin shipment update error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
