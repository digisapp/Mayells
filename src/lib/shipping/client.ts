/**
 * Shipping provider abstraction.
 *
 * Currently uses Shippo for standard shipping (FedEx, UPS, USPS).
 * Can be extended with Arta for white-glove art shipping.
 *
 * Set SHIPPO_API_KEY in env to enable.
 * Set ARTA_API_KEY in env for white glove.
 */

import type {
  CreateShipmentParams,
  ShippingRate,
  ShippingLabel,
  TrackingInfo,
} from './types';

const SHIPPO_API_URL = 'https://api.goshippo.com';
const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY;

function shippoHeaders() {
  if (!SHIPPO_API_KEY) throw new Error('SHIPPO_API_KEY not configured');
  return {
    'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a shipment and get available rates from all carriers.
 */
export async function getRates(params: CreateShipmentParams): Promise<{ shipmentId: string; rates: ShippingRate[] }> {
  const response = await fetch(`${SHIPPO_API_URL}/shipments`, {
    method: 'POST',
    headers: shippoHeaders(),
    body: JSON.stringify({
      address_from: formatAddress(params.from),
      address_to: formatAddress(params.to),
      parcels: [formatParcel(params.parcel)],
      extra: {
        signature_confirmation: params.requireSignature ? 'STANDARD' : undefined,
        insurance: params.declaredValue ? {
          amount: (params.declaredValue / 100).toFixed(2),
          currency: 'USD',
          content: 'Auction item',
        } : undefined,
      },
      async: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shippo shipment creation failed: ${error}`);
  }

  const data = await response.json();

  const rates: ShippingRate[] = (data.rates || [])
    .map((rate: Record<string, unknown>) => {
      const amount = parseFloat(rate.amount as string);
      if (isNaN(amount)) return null;
      return {
        rateId: rate.object_id as string,
        carrier: (rate.provider as string || '').toLowerCase(),
        service: (rate.servicelevel_name || rate.servicelevel_token || 'Standard') as string,
        estimatedDays: (rate.estimated_days as number) || 0,
        amount: Math.round(amount * 100),
        currency: (rate.currency as string) || 'USD',
      };
    })
    .filter((r: ShippingRate | null): r is ShippingRate => r !== null);

  // Sort by price ascending
  rates.sort((a, b) => a.amount - b.amount);

  return { shipmentId: data.object_id, rates };
}

/**
 * Purchase a shipping label from a selected rate.
 */
export async function purchaseLabel(rateId: string): Promise<ShippingLabel> {
  const response = await fetch(`${SHIPPO_API_URL}/transactions`, {
    method: 'POST',
    headers: shippoHeaders(),
    body: JSON.stringify({
      rate: rateId,
      label_file_type: 'PDF',
      async: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shippo label purchase failed: ${error}`);
  }

  const data = await response.json();

  if (data.status !== 'SUCCESS') {
    throw new Error(`Label creation failed: ${data.messages ? JSON.stringify(data.messages) : 'Unknown error'}`);
  }

  return {
    labelUrl: data.label_url,
    trackingNumber: data.tracking_number,
    trackingUrl: data.tracking_url_provider,
    carrier: (data.provider || '').toLowerCase(),
    externalTransactionId: data.object_id,
  };
}

/**
 * Get tracking info for a shipment.
 */
export async function getTracking(carrier: string, trackingNumber: string): Promise<TrackingInfo> {
  const response = await fetch(
    `${SHIPPO_API_URL}/tracks/${carrier}/${trackingNumber}`,
    { headers: shippoHeaders() },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shippo tracking failed: ${error}`);
  }

  const data = await response.json();

  return {
    trackingNumber: data.tracking_number,
    carrier: carrier,
    status: data.tracking_status?.status || 'UNKNOWN',
    estimatedDelivery: data.eta,
    events: (data.tracking_history || []).map((event: Record<string, unknown>) => ({
      status: (event.status as string) || '',
      description: (event.status_details as string) || '',
      location: event.location ? formatTrackingLocation(event.location as Record<string, string>) : undefined,
      timestamp: (event.status_date as string) || '',
    })),
  };
}

/**
 * Validate an address with Shippo.
 */
export async function validateAddress(address: {
  street: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}): Promise<{ isValid: boolean; suggested?: typeof address }> {
  const response = await fetch(`${SHIPPO_API_URL}/addresses`, {
    method: 'POST',
    headers: shippoHeaders(),
    body: JSON.stringify({
      ...formatAddress({ name: 'Validation', ...address }),
      validate: true,
    }),
  });

  if (!response.ok) return { isValid: false };

  const data = await response.json();
  const isValid = data.validation_results?.is_valid ?? false;

  return {
    isValid,
    suggested: isValid ? undefined : {
      street: data.street1 || address.street,
      street2: data.street2 || address.street2,
      city: data.city || address.city,
      state: data.state || address.state,
      zip: data.zip || address.zip,
      country: data.country || address.country,
    },
  };
}

// --- Helpers ---

function formatAddress(addr: { name: string; phone?: string; email?: string; street: string; street2?: string; city: string; state: string; zip: string; country: string }) {
  return {
    name: addr.name,
    phone: addr.phone || '',
    email: addr.email || '',
    street1: addr.street,
    street2: addr.street2 || '',
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country,
  };
}

function formatParcel(parcel: { weightLbs?: number; weightOz?: number; lengthIn?: number; widthIn?: number; heightIn?: number }) {
  const totalOz = ((parcel.weightLbs || 0) * 16) + (parcel.weightOz || 0);
  return {
    length: String(parcel.lengthIn || 12),
    width: String(parcel.widthIn || 12),
    height: String(parcel.heightIn || 6),
    distance_unit: 'in',
    weight: String(totalOz || 32), // default 2lbs if not specified
    mass_unit: 'oz',
  };
}

function formatTrackingLocation(loc: Record<string, string>): string {
  return [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
}
