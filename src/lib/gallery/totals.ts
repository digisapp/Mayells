/**
 * Reconciling a Buy Now invoice with what Stripe actually charged.
 *
 * The hold invoice is created before the buyer has given an address, so it
 * carries the price and shipping but no tax: Stripe Tax works the tax out on
 * its page from the delivery address. When the payment lands, the invoice is
 * brought up to the session's real figures — but only if the parts we set
 * (the price and the shipping charge) are exactly what we asked for. Anything
 * else is left alone for the webhook's amount check to flag for reconciling.
 */

export interface HoldInvoiceAmounts {
  hammerPrice: number;
  shippingCost: number | null;
  totalAmount: number;
}

export interface CheckoutSessionAmounts {
  currency: string | null;
  amount_subtotal: number | null;
  amount_total: number | null;
  total_details: {
    amount_discount: number;
    amount_shipping: number | null;
    amount_tax: number;
  } | null;
}

export type GalleryTotals =
  | { ok: true; shippingCost: number; taxAmount: number; totalAmount: number }
  | { ok: false; reason: string };

export function galleryTotalsFromSession(invoice: HoldInvoiceAmounts, session: CheckoutSessionAmounts): GalleryTotals {
  if (session.currency !== 'usd') return { ok: false, reason: `session currency is ${session.currency ?? 'unknown'}` };
  if (session.amount_subtotal == null || session.amount_total == null || !session.total_details) {
    return { ok: false, reason: 'session has no totals' };
  }
  const expectedShipping = invoice.shippingCost ?? 0;
  const shipping = session.total_details.amount_shipping ?? 0;
  const tax = session.total_details.amount_tax;
  if (session.amount_subtotal !== invoice.hammerPrice) {
    return { ok: false, reason: `item subtotal ${session.amount_subtotal} differs from the price ${invoice.hammerPrice}` };
  }
  if (shipping !== expectedShipping) {
    return { ok: false, reason: `shipping ${shipping} differs from the quoted ${expectedShipping}` };
  }
  if (session.total_details.amount_discount !== 0) {
    return { ok: false, reason: `a discount of ${session.total_details.amount_discount} was applied` };
  }
  if (tax < 0) return { ok: false, reason: 'negative tax' };
  // Exclusive tax: the total is the parts added up. Anything else means the
  // session was priced in a way this code didn't set up.
  if (session.amount_total !== invoice.hammerPrice + shipping + tax) {
    return { ok: false, reason: `session total ${session.amount_total} is not price + shipping + tax` };
  }
  return { ok: true, shippingCost: shipping, taxAmount: tax, totalAmount: session.amount_total };
}
