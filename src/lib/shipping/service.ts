/**
 * Shipping service — orchestrates the full shipping flow:
 *
 * 1. Invoice paid → create shipment record
 * 2. Generate label → notify seller (drop off at FedEx/UPS or schedule pickup)
 * 3. Track → update status → notify buyer
 */

import { db } from '@/db';
import { shipments, invoices, lots, users, automationSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getRates, purchaseLabel, getTracking } from './client';
import type { ShippingAddress, PackageDimensions } from './types';
import { logger } from '@/lib/logger';

/**
 * Create a shipment record when an invoice is paid.
 * Optionally auto-generates a label if automation settings allow.
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
  if (!invoice.lot?.sellerId) throw new Error('Lot has no seller');

  // Get seller info
  const seller = await db.query.users.findFirst({
    where: eq(users.id, invoice.lot.sellerId),
  });

  if (!seller) throw new Error('Seller not found');

  // Determine shipping method based on item value
  const settings = await getAutomationSettings();
  const hammerPrice = invoice.hammerPrice || 0;
  const isWhiteGlove = hammerPrice >= (settings?.whiteGloveThreshold || 100000);

  // Build addresses
  const fromAddress: ShippingAddress = {
    name: seller.fullName || seller.displayName || 'Seller',
    phone: seller.phone || undefined,
    email: seller.email,
    street: seller.shippingAddress || '',
    city: seller.shippingCity || '',
    state: seller.shippingState || '',
    zip: seller.shippingZip || '',
    country: seller.shippingCountry || 'US',
  };

  const buyerAddress = parseShippingAddress(invoice.shippingAddress || '');
  const toAddress: ShippingAddress = {
    name: invoice.buyer?.fullName || 'Buyer',
    phone: invoice.buyer?.phone || undefined,
    email: invoice.buyer?.email || '',
    street: buyerAddress.street || invoice.buyer?.shippingAddress || '',
    city: buyerAddress.city || invoice.buyer?.shippingCity || '',
    state: buyerAddress.state || invoice.buyer?.shippingState || '',
    zip: buyerAddress.zip || invoice.buyer?.shippingZip || '',
    country: buyerAddress.country || invoice.buyer?.shippingCountry || 'US',
  };

  // Create shipment record
  const [shipment] = await db.insert(shipments).values({
    invoiceId: invoice.id,
    lotId: invoice.lotId,
    sellerId: invoice.lot.sellerId,
    buyerId: invoice.buyerId,
    method: isWhiteGlove ? 'white_glove' : 'standard',
    status: 'pending',
    shippingCost: invoice.shippingCost || 0,
    insuranceCost: invoice.insuranceCost || 0,
    insuranceValue: hammerPrice,
    requiresSignature: settings?.requireSignature ?? true,
    requiresInsurance: settings?.requireInsurance ?? true,
    isFragile: isWhiteGlove,
    fromName: fromAddress.name,
    fromPhone: fromAddress.phone || null,
    fromEmail: fromAddress.email || null,
    fromStreet: fromAddress.street,
    fromCity: fromAddress.city,
    fromState: fromAddress.state,
    fromZip: fromAddress.zip,
    fromCountry: fromAddress.country,
    toName: toAddress.name,
    toPhone: toAddress.phone || null,
    toEmail: toAddress.email || null,
    toStreet: toAddress.street,
    toCity: toAddress.city,
    toState: toAddress.state,
    toZip: toAddress.zip,
    toCountry: toAddress.country,
  }).returning();

  // Auto-generate label if enabled
  if (settings?.autoGenerateLabel && !isWhiteGlove) {
    try {
      await generateLabelForShipment(shipment.id);
    } catch (err) {
      logger.error('Auto label generation failed, seller will need to request manually', err);
    }
  }

  return shipment;
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
    street: shipment.fromStreet,
    city: shipment.fromCity,
    state: shipment.fromState,
    zip: shipment.fromZip,
    country: shipment.fromCountry,
  };

  const to: ShippingAddress = {
    name: shipment.toName,
    phone: shipment.toPhone || undefined,
    email: shipment.toEmail || undefined,
    street: shipment.toStreet,
    city: shipment.toCity,
    state: shipment.toState,
    zip: shipment.toZip,
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
  const shipment = await db.query.shipments.findFirst({
    where: eq(shipments.id, shipmentId),
  });

  if (shipment) {
    await db.update(invoices).set({
      trackingNumber: label.trackingNumber,
      updatedAt: new Date(),
    }).where(eq(invoices.id, shipment.invoiceId));
  }

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

/**
 * Parse a freeform shipping address string into components.
 * Falls back gracefully if parsing fails.
 */
function parseShippingAddress(address: string): Partial<ShippingAddress> {
  if (!address) return {};

  // Try simple line-based parsing: street\ncity, state zip
  const lines = address.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { street: address };

  const street = lines[0];
  const cityStateZip = lines[lines.length - 1];
  const match = cityStateZip.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)$/i);

  if (match) {
    return {
      street,
      city: match[1].trim(),
      state: match[2].trim(),
      zip: match[3].trim(),
      country: 'US',
    };
  }

  return { street: address };
}
