import { describe, expect, it } from 'vitest';
import {
  galleryPurchaseState,
  isActiveHold,
  isOnlinePurchasable,
  onlineCheckoutBlockers,
  type GalleryLotFields,
  type GalleryReservation,
} from '../purchase-state';

const NOW = new Date('2026-10-22T15:00:00Z');
const LATER = new Date('2026-10-22T15:20:00Z');
const EARLIER = new Date('2026-10-22T14:40:00Z');

function lot(overrides: Partial<GalleryLotFields> = {}): GalleryLotFields {
  return {
    saleType: 'gallery',
    status: 'for_sale',
    buyNowPrice: 450_000,
    onlineCheckout: true,
    shippingPrice: 7_500,
    ...overrides,
  };
}

function state(params: {
  lot?: GalleryLotFields;
  reservation?: GalleryReservation | null;
  viewerId?: string | null;
  checkoutConfigured?: boolean;
}) {
  return galleryPurchaseState({
    lot: params.lot ?? lot(),
    reservation: params.reservation ?? null,
    viewerId: params.viewerId ?? null,
    checkoutConfigured: params.checkoutConfigured ?? true,
    now: NOW,
  });
}

describe('isOnlinePurchasable', () => {
  it('needs a listed gallery piece with a price, a shipping charge and the switch on', () => {
    expect(isOnlinePurchasable(lot())).toBe(true);
    expect(isOnlinePurchasable(lot({ shippingPrice: 0 }))).toBe(true); // complimentary shipping
    expect(isOnlinePurchasable(lot({ onlineCheckout: false }))).toBe(false);
    expect(isOnlinePurchasable(lot({ shippingPrice: null }))).toBe(false);
    expect(isOnlinePurchasable(lot({ buyNowPrice: null }))).toBe(false);
    expect(isOnlinePurchasable(lot({ buyNowPrice: 0 }))).toBe(false);
    expect(isOnlinePurchasable(lot({ saleType: 'private' }))).toBe(false);
    expect(isOnlinePurchasable(lot({ status: 'approved' }))).toBe(false);
  });
});

describe('onlineCheckoutBlockers', () => {
  it('lists every missing piece in the editor’s words', () => {
    expect(onlineCheckoutBlockers({ saleType: 'gallery', status: 'draft', buyNowPrice: 100, shippingPrice: 0 })).toEqual([]);
    expect(onlineCheckoutBlockers({ saleType: 'auction', status: 'draft', buyNowPrice: null, shippingPrice: null })).toHaveLength(3);
    expect(onlineCheckoutBlockers({ saleType: 'gallery', status: 'draft', buyNowPrice: 100, shippingPrice: null })).toEqual([
      'Set the US shipping price (0 for complimentary).',
    ]);
  });
});

describe('isActiveHold', () => {
  it('is true only before the hold lapses', () => {
    expect(isActiveHold({ buyerId: 'b', holdExpiresAt: LATER, accessToken: 't' }, NOW)).toBe(true);
    expect(isActiveHold({ buyerId: 'b', holdExpiresAt: EARLIER, accessToken: 't' }, NOW)).toBe(false);
    expect(isActiveHold({ buyerId: 'b', holdExpiresAt: null, accessToken: 't' }, NOW)).toBe(false);
    expect(isActiveHold(null, NOW)).toBe(false);
  });
});

describe('galleryPurchaseState', () => {
  it('offers Buy Now when checkout is configured and the piece qualifies', () => {
    expect(state({})).toEqual({ kind: 'buy' });
  });

  it('falls back to an inquiry when Stripe is not configured or the switch is off', () => {
    expect(state({ checkoutConfigured: false })).toEqual({ kind: 'inquire' });
    expect(state({ lot: lot({ onlineCheckout: false }) })).toEqual({ kind: 'inquire' });
    expect(state({ lot: lot({ saleType: 'private', buyNowPrice: null }) })).toEqual({ kind: 'inquire' });
  });

  it('is unavailable when a gallery piece has no price, and sold once sold', () => {
    expect(state({ lot: lot({ buyNowPrice: null, onlineCheckout: false }) })).toEqual({ kind: 'unavailable' });
    expect(state({ lot: lot({ status: 'sold' }) })).toEqual({ kind: 'sold' });
    expect(state({ lot: lot({ status: 'withdrawn' }) })).toEqual({ kind: 'unavailable' });
  });

  it('shows a live hold as the viewer’s own reservation, or as on hold to everyone else', () => {
    const reservation = { buyerId: 'buyer-1', holdExpiresAt: LATER, accessToken: 'tok' };
    expect(state({ reservation, viewerId: 'buyer-1' })).toEqual({ kind: 'held_for_you', until: LATER });
    expect(state({ reservation, viewerId: 'buyer-2' })).toEqual({ kind: 'on_hold', until: LATER });
    expect(state({ reservation, viewerId: null })).toEqual({ kind: 'on_hold', until: LATER });
  });

  it('treats a lapsed hold as released, even before the cron sweeps it', () => {
    const reservation = { buyerId: 'buyer-1', holdExpiresAt: EARLIER, accessToken: 'tok' };
    expect(state({ reservation, viewerId: 'buyer-2' })).toEqual({ kind: 'buy' });
    expect(state({ reservation, viewerId: 'buyer-1' })).toEqual({ kind: 'buy' });
  });

  it('shows a specialist’s invoice only to its client, and as reserved to others', () => {
    const reservation = { buyerId: 'buyer-1', holdExpiresAt: null, accessToken: 'tok' };
    expect(state({ reservation, viewerId: 'buyer-1' })).toEqual({ kind: 'invoiced_to_you', accessToken: 'tok' });
    const other = state({ reservation, viewerId: 'buyer-2' });
    expect(other).toEqual({ kind: 'reserved' });
    expect(JSON.stringify(other)).not.toContain('tok');
  });
});
