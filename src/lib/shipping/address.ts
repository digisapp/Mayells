/**
 * Structured shipping address stored on invoices.shipping_address as a JSON
 * string (captured from Stripe Checkout's shipping_address_collection). Older
 * rows may hold free text — parseStoredShippingAddress falls back to a
 * best-effort line parser so nothing that used to work stops working.
 */

export interface StructuredShippingAddress {
  name?: string | null;
  phone?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

const JSON_MARKER = /^\s*\{/;

export function serializeShippingAddress(addr: StructuredShippingAddress): string {
  return JSON.stringify({
    name: addr.name ?? null,
    phone: addr.phone ?? null,
    line1: addr.line1 ?? null,
    line2: addr.line2 ?? null,
    city: addr.city ?? null,
    state: addr.state ?? null,
    postalCode: addr.postalCode ?? null,
    country: addr.country ?? null,
  });
}

/** Stripe's Address shape → ours. */
export function fromStripeAddress(
  address: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null | undefined,
  name?: string | null,
  phone?: string | null,
): StructuredShippingAddress | null {
  if (!address) return null;
  return {
    name: name ?? null,
    phone: phone ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postalCode: address.postal_code ?? null,
    country: address.country ?? null,
  };
}

/**
 * Parse whatever is stored on the invoice. Returns an empty object (never
 * throws) when there is nothing usable.
 */
export function parseStoredShippingAddress(stored: string | null | undefined): StructuredShippingAddress {
  if (!stored) return {};
  if (JSON_MARKER.test(stored)) {
    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const str = (k: string) => (typeof parsed[k] === 'string' && (parsed[k] as string).trim() ? (parsed[k] as string).trim() : null);
      return {
        name: str('name'),
        phone: str('phone'),
        line1: str('line1') ?? str('street'),
        line2: str('line2') ?? str('street2'),
        city: str('city'),
        state: str('state'),
        postalCode: str('postalCode') ?? str('postal_code') ?? str('zip'),
        country: str('country'),
      };
    } catch {
      // fall through to the free-text parser
    }
  }
  return parseFreeformAddress(stored);
}

/**
 * Best-effort parse of a free-text address: "street\ncity, ST 12345".
 * Anything we can't split stays on line1 so the admin can fix it by hand.
 */
export function parseFreeformAddress(address: string): StructuredShippingAddress {
  const lines = address.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return {};
  if (lines.length < 2) return { line1: address.trim() };

  const line1 = lines[0];
  const line2 = lines.length > 2 ? lines.slice(1, -1).join(', ') : null;
  const cityStateZip = lines[lines.length - 1];
  const match = cityStateZip.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)$/i);
  if (match) {
    return {
      line1,
      line2,
      city: match[1].trim(),
      state: match[2].trim().toUpperCase(),
      postalCode: match[3].trim(),
      country: 'US',
    };
  }
  return { line1: address.trim() };
}

/** A shippable destination needs at least a street and a postal code. */
export function isDeliverable(addr: StructuredShippingAddress | null | undefined): boolean {
  return !!(addr?.line1 && addr?.postalCode);
}

export function formatAddressLines(addr: StructuredShippingAddress | null | undefined): string[] {
  if (!addr) return [];
  const cityLine = [addr.city, [addr.state, addr.postalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [addr.name, addr.line1, addr.line2, cityLine, addr.country && addr.country !== 'US' ? addr.country : null]
    .filter((l): l is string => !!l && l.trim().length > 0);
}
