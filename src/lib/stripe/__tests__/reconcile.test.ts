import { describe, it, expect } from 'vitest';
import {
  storedSessionAction,
  cardPaymentOnSession,
  strayPaymentAction,
  type CheckoutSessionState,
} from '../reconcile';

function session(overrides: Partial<CheckoutSessionState> = {}): CheckoutSessionState {
  return {
    status: 'open',
    payment_status: 'unpaid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    payment_intent: null,
    ...overrides,
  };
}

describe('storedSessionAction', () => {
  it('reuses an open session', () => {
    expect(storedSessionAction(session())).toBe('reuse');
  });

  it('replaces an open session with no URL', () => {
    expect(storedSessionAction(session({ url: null }))).toBe('replace');
  });

  it('waits on a completed, paid session (webhook in flight)', () => {
    expect(
      storedSessionAction(session({ status: 'complete', payment_status: 'paid', payment_intent: { status: 'succeeded' } })),
    ).toBe('processing');
  });

  it('waits on a completed session whose delayed payment is still settling', () => {
    expect(storedSessionAction(session({ status: 'complete', payment_intent: { status: 'processing' } }))).toBe('processing');
  });

  it('waits on a completed session whose intent it cannot see (fail closed)', () => {
    expect(storedSessionAction(session({ status: 'complete', payment_intent: 'pi_123' }))).toBe('processing');
  });

  it('replaces a completed session whose payment failed afterwards', () => {
    expect(
      storedSessionAction(session({ status: 'complete', payment_intent: { status: 'requires_payment_method' } })),
    ).toBe('replace');
    expect(storedSessionAction(session({ status: 'complete', payment_intent: { status: 'canceled' } }))).toBe('replace');
  });

  it('replaces an expired session', () => {
    expect(storedSessionAction(session({ status: 'expired', url: null }))).toBe('replace');
  });
});

describe('cardPaymentOnSession', () => {
  it('sees no card payment on an open or expired session', () => {
    expect(cardPaymentOnSession(session())).toBeNull();
    expect(cardPaymentOnSession(session({ status: 'expired' }))).toBeNull();
  });

  it('reports a paid session', () => {
    expect(cardPaymentOnSession(session({ status: 'complete', payment_status: 'paid' }))).toBe('paid');
    expect(cardPaymentOnSession(session({ status: 'complete', payment_intent: { status: 'succeeded' } }))).toBe('paid');
  });

  it('reports a payment still settling, or one it cannot see, as processing', () => {
    expect(cardPaymentOnSession(session({ status: 'complete', payment_intent: { status: 'processing' } }))).toBe('processing');
    expect(cardPaymentOnSession(session({ status: 'complete', payment_intent: 'pi_123' }))).toBe('processing');
  });

  it('lets a manual payment through once the session payment has failed', () => {
    expect(
      cardPaymentOnSession(session({ status: 'complete', payment_intent: { status: 'requires_payment_method' } })),
    ).toBeNull();
  });
});

describe('strayPaymentAction', () => {
  it('does nothing for the invoice payment of record', () => {
    expect(strayPaymentAction({ status: 'paid', stripePaymentIntentId: 'pi_1' }, 'pi_1')).toBe('none');
  });

  it('holds a card payment on an invoice marked paid by hand (never auto-refunds it)', () => {
    expect(strayPaymentAction({ status: 'paid', stripePaymentIntentId: null }, 'pi_1')).toBe('hold');
  });

  it('refunds a true double charge (invoice already paid by a different card payment)', () => {
    expect(strayPaymentAction({ status: 'paid', stripePaymentIntentId: 'pi_first' }, 'pi_second')).toBe('refund');
  });

  it('refunds a charge on a cancelled or refunded invoice', () => {
    expect(strayPaymentAction({ status: 'cancelled', stripePaymentIntentId: null }, 'pi_1')).toBe('refund');
    expect(strayPaymentAction({ status: 'refunded', stripePaymentIntentId: null }, 'pi_1')).toBe('refund');
    expect(strayPaymentAction({ status: 'refunded', stripePaymentIntentId: 'pi_old' }, 'pi_1')).toBe('refund');
  });
});
