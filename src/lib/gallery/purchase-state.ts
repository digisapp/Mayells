/**
 * What a gallery piece offers the person looking at it: Buy Now, a hold
 * (theirs or someone else's), an inquiry, or nothing. Pure, so the lot page,
 * the gallery grid and the checkout route all apply the same rules.
 */

export interface GalleryLotFields {
  saleType: string;
  status: string;
  buyNowPrice: number | null;
  onlineCheckout: boolean;
  shippingPrice: number | null;
}

/**
 * The lot's live (pending or overdue) invoice, if any. While one exists the
 * piece is spoken for: either a Buy Now checkout hold (holdExpiresAt set) or
 * an invoice a specialist sent a client (no hold, payable until cancelled).
 */
export interface GalleryReservation {
  buyerId: string;
  holdExpiresAt: Date | null;
  accessToken: string;
}

export type GalleryPurchaseState =
  /** Online checkout is open to this viewer. */
  | { kind: 'buy' }
  /** The viewer started checkout and the piece is held for them until `until`. */
  | { kind: 'held_for_you'; until: Date }
  /** Another buyer is in checkout; the piece is free again after `until` if they don't pay. */
  | { kind: 'on_hold'; until: Date }
  /** A specialist invoiced the viewer for this piece. */
  | { kind: 'invoiced_to_you'; accessToken: string }
  /** Invoiced to someone else and awaiting their payment. */
  | { kind: 'reserved' }
  /** Listed, but bought through a specialist rather than online. */
  | { kind: 'inquire' }
  | { kind: 'sold' }
  | { kind: 'unavailable' };

/** Everything online checkout needs from the piece itself. */
export function isOnlinePurchasable(lot: GalleryLotFields): boolean {
  return (
    lot.saleType === 'gallery' &&
    lot.status === 'for_sale' &&
    !!lot.buyNowPrice &&
    lot.buyNowPrice > 0 &&
    lot.onlineCheckout &&
    lot.shippingPrice != null &&
    lot.shippingPrice >= 0
  );
}

/**
 * Why a piece can't be bought online yet, in the words the admin lot page
 * shows. Empty when it can. Leaves out whether checkout is switched on, so
 * the editor can list what must be fixed before the switch will stick.
 */
export function onlineCheckoutBlockers(lot: Omit<GalleryLotFields, 'onlineCheckout'>): string[] {
  const blockers: string[] = [];
  if (lot.saleType !== 'gallery') blockers.push('Set the sale type to Gallery (Buy Now).');
  if (!lot.buyNowPrice || lot.buyNowPrice <= 0) blockers.push('Set a Buy Now price.');
  if (lot.shippingPrice == null || lot.shippingPrice < 0) {
    blockers.push('Set the US shipping price (0 for complimentary).');
  }
  return blockers;
}

/** A hold whose time is up no longer reserves anything, even before the cron sweeps it. */
export function isActiveHold(reservation: GalleryReservation | null, now: Date): boolean {
  return !!reservation?.holdExpiresAt && reservation.holdExpiresAt.getTime() > now.getTime();
}

export function galleryPurchaseState(params: {
  lot: GalleryLotFields;
  reservation: GalleryReservation | null;
  viewerId: string | null;
  /** Card payments are configured (Stripe key present). */
  checkoutConfigured: boolean;
  now: Date;
}): GalleryPurchaseState {
  const { lot, reservation, viewerId, checkoutConfigured, now } = params;

  if (lot.status === 'sold') return { kind: 'sold' };
  if (lot.status !== 'for_sale') return { kind: 'unavailable' };

  if (reservation) {
    const mine = !!viewerId && reservation.buyerId === viewerId;
    if (reservation.holdExpiresAt) {
      if (isActiveHold(reservation, now)) {
        return mine
          ? { kind: 'held_for_you', until: reservation.holdExpiresAt }
          : { kind: 'on_hold', until: reservation.holdExpiresAt };
      }
      // A lapsed hold: the checkout route releases it on the next attempt.
    } else {
      return mine ? { kind: 'invoiced_to_you', accessToken: reservation.accessToken } : { kind: 'reserved' };
    }
  }

  if (checkoutConfigured && isOnlinePurchasable(lot)) return { kind: 'buy' };
  if (lot.buyNowPrice || lot.saleType === 'private') return { kind: 'inquire' };
  return { kind: 'unavailable' };
}
