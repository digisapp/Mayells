/**
 * Shipping service — orchestrates the shipping flow:
 *
 * 1. Invoice paid → create shipment record (seeded from the checkout address
 *    and the consignment's parcel estimates), tell the seller to ship
 * 2. Generate label (Shippo) when configured
 * 3. Admin/tracking moves it along → notify the buyer once it's on its way
 */

import { db } from '@/db';
import { shipments, invoices, users, consignments, payouts, automationSettings } from '@/db/schema';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { getRates, purchaseLabel, getTracking } from './client';
import type { ShippingAddress, PackageDimensions } from './types';
import { parseStoredShippingAddress, isDeliverable, type StructuredShippingAddress } from './address';
import { sendSellerShippingNotification, sendBuyerShippingNotification } from '@/lib/email/notifications';
import { isSentinelEmail } from '@/lib/sellers/shadow';
import { portalUrl } from '@/lib/sellers/portal';
import { logger } from '@/lib/logger';

const DEFAULT_WHITE_GLOVE_THRESHOLD = 100000;

interface AddressBlock {
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
}

/**
 * Create a shipment record when an invoice is paid.
 * Optionally auto-generates a label if automation settings allow.
 * Returns null (never throws) when the shipment can't be created yet.
 */
export async function createShipmentForInvoice(invoiceId: string) {
  // Fetch invoice with buyer and lot details
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: {
      buyer: true,
      lot: true,
    },
  });

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  // Prospect-sourced lots can legitimately have no seller-of-record (the
  // consignor never created an account). Don't hard-throw and fail the caller
  // (e.g. settlement / payment webhook) — surface it for manual handling and
  // return null so a shipment is simply deferred, not crashed.
  if (!invoice.lot?.sellerId) {
    logger.warn('Cannot auto-create shipment: lot has no seller — needs manual handling', {
      invoiceId,
      lotId: invoice.lotId,
    });
    return null;
  }

  const seller = await db.query.users.findFirst({
    where: eq(users.id, invoice.lot.sellerId),
  });

  if (!seller) {
    logger.warn('Cannot auto-create shipment: seller record not found', {
      invoiceId,
      sellerId: invoice.lot.sellerId,
    });
    return null;
  }

  const settings = await getAutomationSettings();
  const consignment = invoice.lot.consignmentId
    ? await db.query.consignments.findFirst({ where: eq(consignments.id, invoice.lot.consignmentId) })
    : null;

  // Determine shipping method based on item value. `??` so an explicit 0
  // threshold ("everything is white glove") is honoured.
  const hammerPrice = invoice.hammerPrice || 0;
  const whiteGloveThreshold = settings?.whiteGloveThreshold ?? DEFAULT_WHITE_GLOVE_THRESHOLD;
  const isWhiteGlove = hammerPrice >= whiteGloveThreshold || consignment?.requiresWhiteGlove === true;

  // Ship-from: the seller's profile address, else the pickup address they
  // gave on the consignment (prospect/shadow sellers usually only have that).
  const from: AddressBlock = seller.shippingAddress && seller.shippingZip
    ? {
        street: seller.shippingAddress,
        street2: null,
        city: seller.shippingCity,
        state: seller.shippingState,
        zip: seller.shippingZip,
        country: seller.shippingCountry || 'US',
      }
    : consignment?.pickupStreet
      ? {
          street: consignment.pickupStreet,
          street2: consignment.pickupStreet2,
          city: consignment.pickupCity,
          state: consignment.pickupState,
          zip: consignment.pickupZip,
          country: consignment.pickupCountry || 'US',
        }
      : { street: null, street2: null, city: null, state: null, zip: null, country: seller.shippingCountry || 'US' };

  // Ship-to: the address Stripe collected at checkout, else the buyer profile.
  const collected = parseStoredShippingAddress(invoice.shippingAddress);
  const to: StructuredShippingAddress = isDeliverable(collected)
    ? collected
    : {
        name: invoice.buyer?.fullName ?? null,
        phone: invoice.buyer?.phone ?? null,
        line1: invoice.buyer?.shippingAddress ?? null,
        line2: null,
        city: invoice.buyer?.shippingCity ?? null,
        state: invoice.buyer?.shippingState ?? null,
        postalCode: invoice.buyer?.shippingZip ?? null,
        country: invoice.buyer?.shippingCountry ?? null,
      };
  const deliverable = isDeliverable(to);

  // Create shipment record. onConflictDoNothing + the partial unique index on
  // invoice_id make concurrent auto-creation (racing webhook deliveries)
  // collapse to a single shipment instead of duplicates.
  const [shipment] = await db.insert(shipments).values({
    invoiceId: invoice.id,
    lotId: invoice.lotId,
    sellerId: invoice.lot.sellerId,
    buyerId: invoice.buyerId,
    method: isWhiteGlove ? 'white_glove' : consignment?.requestPickup ? 'pickup' : 'standard',
    // No usable destination → flag it instead of storing blanks the label
    // flow would choke on.
    status: deliverable ? 'pending' : 'needs_address',
    shippingCost: invoice.shippingCost || 0,
    insuranceCost: invoice.insuranceCost || 0,
    insuranceValue: hammerPrice,
    requiresSignature: settings?.requireSignature ?? true,
    requiresInsurance: settings?.requireInsurance ?? true,
    isFragile: isWhiteGlove || consignment?.isFragile === true,
    // Parcel estimates the consignor supplied — gives auto-label a chance.
    weightLbs: consignment?.weightLbs ?? null,
    lengthIn: consignment?.lengthIn ?? null,
    widthIn: consignment?.widthIn ?? null,
    heightIn: consignment?.heightIn ?? null,
    fromName: seller.fullName || seller.displayName || 'Seller',
    fromPhone: seller.phone || consignment?.pickupPhone || null,
    fromEmail: isSentinelEmail(seller.email) ? null : seller.email,
    fromStreet: from.street,
    fromStreet2: from.street2,
    fromCity: from.city,
    fromState: from.state,
    fromZip: from.zip,
    fromCountry: from.country,
    toName: to.name || invoice.buyer?.fullName || 'Buyer',
    toPhone: to.phone || invoice.buyer?.phone || null,
    toEmail: invoice.buyer?.email || null,
    toStreet: to.line1 ?? null,
    toStreet2: to.line2 ?? null,
    toCity: to.city ?? null,
    toState: to.state ?? null,
    toZip: to.postalCode ?? null,
    toCountry: to.country || 'US',
  }).onConflictDoNothing().returning();

  // Conflict — another concurrent call already created this invoice's shipment
  if (!shipment) return null;

  if (!deliverable) {
    logger.warn('Shipment created without a deliverable address — needs_address', {
      shipmentId: shipment.id,
      invoiceId,
    });
  }

  // Tell the seller their item sold and needs to ship. Never throws.
  await notifySellerToShip(shipment.id);

  // Auto-generate label if enabled
  if (settings?.autoGenerateLabel && !isWhiteGlove) {
    if (!deliverable) {
      await appendInternalNote(shipment.id, 'Auto-label skipped: buyer address incomplete — collect the address, then generate the label.');
    } else {
      try {
        await generateLabelForShipment(shipment.id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error('Auto label generation failed, seller will need to request manually', err, {
          shipmentId: shipment.id,
        });
        await appendInternalNote(shipment.id, `Auto-label failed: ${reason}`);
      }
    }
  }

  return shipment;
}

async function appendInternalNote(shipmentId: string, note: string) {
  try {
    const [row] = await db.select({ internalNotes: shipments.internalNotes }).from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
    const stamped = `${new Date().toISOString().slice(0, 10)}: ${note}`;
    await db
      .update(shipments)
      .set({ internalNotes: row?.internalNotes ? `${row.internalNotes}\n${stamped}` : stamped, updatedAt: new Date() })
      .where(eq(shipments.id, shipmentId));
  } catch (err) {
    logger.warn('Could not append internal note to shipment', { shipmentId, err: String(err) });
  }
}

/**
 * "Your item sold — please ship it" email to the seller, once per shipment
 * (seller_notified_at stamp). Respects the notifySellerOnShipment setting and
 * skips shadow sellers with sentinel addresses. Never throws.
 */
export async function notifySellerToShip(shipmentId: string): Promise<boolean> {
  try {
    const settings = await getAutomationSettings();
    if (!(settings?.notifySellerOnShipment ?? true)) return false;

    const shipment = await db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
      with: { seller: true, lot: true },
    });
    if (!shipment || shipment.sellerNotifiedAt) return false;
    if (!shipment.seller?.email || isSentinelEmail(shipment.seller.email)) {
      logger.warn('Skipping seller shipping notice: no reachable email for seller', {
        shipmentId,
        sellerId: shipment.sellerId,
      });
      return false;
    }

    // The live payout (if settlement created it) gives the seller their numbers.
    const [payout] = await db
      .select({ commissionAmount: payouts.commissionAmount, netAmount: payouts.netAmount })
      .from(payouts)
      .where(and(eq(payouts.invoiceId, shipment.invoiceId), notInArray(payouts.status, ['cancelled', 'reversed'])))
      .limit(1);

    // Atomically claim the send so a replay can't email twice; released on
    // failure so a transient Resend error retries on the next replay.
    const claimed = await db
      .update(shipments)
      .set({ sellerNotifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipments.id, shipmentId), isNull(shipments.sellerNotifiedAt)))
      .returning({ id: shipments.id });
    if (claimed.length === 0) return false;

    try {
      await sendSellerShippingNotification({
        sellerEmail: shipment.seller.email,
        sellerName: shipment.seller.fullName || shipment.seller.displayName || 'Consignor',
        lotTitle: shipment.lot.title,
        hammerPrice: shipment.insuranceValue ?? shipment.lot.hammerPrice ?? 0,
        commission: payout?.commissionAmount ?? null,
        sellerPayout: payout?.netAmount ?? null,
        labelUrl: shipment.labelUrl,
        shipmentId: shipment.id,
        isWhiteGlove: shipment.method === 'white_glove',
        portalUrl: portalUrl(shipment.seller.portalToken),
      });
      return true;
    } catch (err) {
      await db
        .update(shipments)
        .set({ sellerNotifiedAt: null, updatedAt: new Date() })
        .where(eq(shipments.id, shipmentId));
      throw err;
    }
  } catch (err) {
    logger.error('Seller shipping notice failed', err, { shipmentId });
    return false;
  }
}

/**
 * "Your item has shipped" email to the buyer, once per shipment
 * (buyer_notified_at stamp). Requires a tracking number. Respects the
 * notifyBuyerOnShipment setting. Never throws.
 */
export async function notifyBuyerShipped(shipmentId: string): Promise<boolean> {
  try {
    const settings = await getAutomationSettings();
    if (!(settings?.notifyBuyerOnShipment ?? true)) return false;

    const shipment = await db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
      with: { buyer: true, lot: true },
    });
    if (!shipment || shipment.buyerNotifiedAt || !shipment.trackingNumber) return false;
    const email = shipment.toEmail || shipment.buyer?.email;
    if (!email || isSentinelEmail(email)) return false;

    const claimed = await db
      .update(shipments)
      .set({ buyerNotifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shipments.id, shipmentId), isNull(shipments.buyerNotifiedAt)))
      .returning({ id: shipments.id });
    if (claimed.length === 0) return false;

    try {
      await sendBuyerShippingNotification({
        buyerEmail: email,
        buyerName: shipment.toName || shipment.buyer?.fullName || 'there',
        lotTitle: shipment.lot.title,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: shipment.trackingUrl,
        carrier: shipment.carrier ?? 'carrier',
        estimatedDelivery: shipment.estimatedDelivery
          ? shipment.estimatedDelivery.toLocaleDateString('en-US', { dateStyle: 'medium' })
          : null,
      });
      return true;
    } catch (err) {
      await db
        .update(shipments)
        .set({ buyerNotifiedAt: null, updatedAt: new Date() })
        .where(eq(shipments.id, shipmentId));
      throw err;
    }
  } catch (err) {
    logger.error('Buyer shipping notice failed', err, { shipmentId });
    return false;
  }
}

/**
 * Get shipping rates for a shipment.
 */
export async function getShipmentRates(shipmentId: string) {
  const shipment = await db.query.shipments.findFirst({
    where: eq(shipments.id, shipmentId),
  });

  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  const from: ShippingAddress = {
    name: shipment.fromName,
    phone: shipment.fromPhone || undefined,
    email: shipment.fromEmail || undefined,
    street: shipment.fromStreet ?? '',
    street2: shipment.fromStreet2 || undefined,
    city: shipment.fromCity ?? '',
    state: shipment.fromState ?? '',
    zip: shipment.fromZip ?? '',
    country: shipment.fromCountry,
  };

  const to: ShippingAddress = {
    name: shipment.toName,
    phone: shipment.toPhone || undefined,
    email: shipment.toEmail || undefined,
    street: shipment.toStreet ?? '',
    street2: shipment.toStreet2 || undefined,
    city: shipment.toCity ?? '',
    state: shipment.toState ?? '',
    zip: shipment.toZip ?? '',
    country: shipment.toCountry,
  };

  const parcel: PackageDimensions = {
    weightLbs: shipment.weightLbs || undefined,
    weightOz: shipment.weightOz || undefined,
    lengthIn: shipment.lengthIn || undefined,
    widthIn: shipment.widthIn || undefined,
    heightIn: shipment.heightIn || undefined,
  };

  return getRates({
    from,
    to,
    parcel,
    declaredValue: shipment.insuranceValue || undefined,
    requireSignature: shipment.requiresSignature,
  });
}

/**
 * Generate a shipping label for a shipment using the cheapest available rate.
 */
export async function generateLabelForShipment(shipmentId: string, rateId?: string) {
  const shipment = await db.query.shipments.findFirst({
    where: eq(shipments.id, shipmentId),
  });
  if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

  // Never buy a real label against fabricated parcel/address defaults. A
  // high-value auction lot silently shipping at a guessed 2 lb / 12×12×6 to a
  // half-parsed address means carrier adjustment charges, refusal, or a label
  // to the wrong place. Require real values (set them via getRates flow / admin
  // before generating a label).
  const missingDims =
    !shipment.lengthIn || !shipment.widthIn || !shipment.heightIn ||
    (!shipment.weightLbs && !shipment.weightOz);
  if (missingDims) {
    throw new Error(
      `Cannot purchase label for shipment ${shipmentId}: parcel weight and dimensions must be set first.`,
    );
  }
  const missingAddress =
    !shipment.toStreet || !shipment.toCity || !shipment.toState || !shipment.toZip;
  if (missingAddress) {
    throw new Error(
      `Cannot purchase label for shipment ${shipmentId}: destination address is incomplete (street, city, state, zip required).`,
    );
  }
  const missingOrigin =
    !shipment.fromStreet || !shipment.fromCity || !shipment.fromState || !shipment.fromZip;
  if (missingOrigin) {
    throw new Error(
      `Cannot purchase label for shipment ${shipmentId}: seller (ship-from) address is incomplete.`,
    );
  }

  let selectedRateId = rateId;

  // If no rate specified, get rates and pick cheapest
  if (!selectedRateId) {
    const { shipmentId: externalId, rates } = await getShipmentRates(shipmentId);
    if (rates.length === 0) throw new Error('No shipping rates available');

    selectedRateId = rates[0].rateId; // cheapest (already sorted)

    // Store external shipment ID
    await db.update(shipments)
      .set({ externalShipmentId: externalId })
      .where(eq(shipments.id, shipmentId));
  }

  // Purchase the label
  const label = await purchaseLabel(selectedRateId);

  // Update shipment with label info
  await db.update(shipments).set({
    status: 'label_created',
    labelUrl: label.labelUrl,
    trackingNumber: label.trackingNumber,
    trackingUrl: label.trackingUrl,
    carrier: label.carrier as 'fedex' | 'ups' | 'usps' | 'dhl' | 'arta' | 'other',
    externalTransactionId: label.externalTransactionId,
    externalRateId: selectedRateId,
    labelCreatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(shipments.id, shipmentId));

  // Also update the invoice tracking number
  await db.update(invoices).set({
    trackingNumber: label.trackingNumber,
    updatedAt: new Date(),
  }).where(eq(invoices.id, shipment.invoiceId));

  return label;
}

/**
 * Update shipment tracking status from carrier.
 */
export async function refreshTracking(shipmentId: string) {
  const shipment = await db.query.shipments.findFirst({
    where: eq(shipments.id, shipmentId),
  });

  if (!shipment?.trackingNumber || !shipment.carrier) {
    throw new Error('No tracking info available');
  }

  const tracking = await getTracking(shipment.carrier, shipment.trackingNumber);

  // Map Shippo status to our status enum
  const statusMap: Record<string, string> = {
    'PRE_TRANSIT': 'label_created',
    'TRANSIT': 'in_transit',
    'DELIVERED': 'delivered',
    'RETURNED': 'returned',
    'FAILURE': 'exception',
  };

  const newStatus = statusMap[tracking.status] || shipment.status;

  await db.update(shipments).set({
    status: newStatus as typeof shipment.status,
    estimatedDelivery: tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery) : null,
    deliveredAt: newStatus === 'delivered' ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(shipments.id, shipmentId));

  return tracking;
}

// --- Helpers ---

async function getAutomationSettings() {
  const [settings] = await db.select().from(automationSettings).limit(1);
  return settings || null;
}
