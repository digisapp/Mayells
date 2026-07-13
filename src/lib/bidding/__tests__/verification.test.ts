import { describe, it, expect } from 'vitest';
import {
  tierFromFlags,
  checkBidAllowed,
  TIER1_MAX_BID,
  CARD_MAX_BID,
} from '../verification';

describe('tierFromFlags', () => {
  it('registered when neither flag set', () => {
    const v = tierFromFlags(false, false);
    expect(v.tier).toBe('registered');
    expect(v.maxBidAllowed).toBe(TIER1_MAX_BID);
  });
  it('card when card-verified only (ceiling is one cent below the identity threshold)', () => {
    const v = tierFromFlags(true, false);
    expect(v.tier).toBe('card');
    expect(v.maxBidAllowed).toBe(CARD_MAX_BID - 1);
    // The advertised ceiling must itself be allowed by the gate.
    expect(checkBidAllowed(v, v.maxBidAllowed).allowed).toBe(true);
  });
  it('identity when identity-verified (regardless of card flag)', () => {
    expect(tierFromFlags(false, true).tier).toBe('identity');
    expect(tierFromFlags(true, true).tier).toBe('identity');
  });
});

describe('checkBidAllowed', () => {
  const registered = tierFromFlags(false, false);
  const card = tierFromFlags(true, false);
  const identity = tierFromFlags(true, true);

  it('registered may bid up to the tier-1 ceiling', () => {
    expect(checkBidAllowed(registered, TIER1_MAX_BID).allowed).toBe(true);
  });

  it('registered is blocked above the tier-1 ceiling and told to add a card', () => {
    const r = checkBidAllowed(registered, TIER1_MAX_BID + 1);
    expect(r.allowed).toBe(false);
    expect(r.requiredTier).toBe('card');
  });

  it('card-verified may bid between the tiers', () => {
    expect(checkBidAllowed(card, TIER1_MAX_BID + 1).allowed).toBe(true);
    expect(checkBidAllowed(card, CARD_MAX_BID - 1).allowed).toBe(true);
  });

  it('card-verified is blocked at/above the card ceiling and told to verify identity', () => {
    const r = checkBidAllowed(card, CARD_MAX_BID);
    expect(r.allowed).toBe(false);
    expect(r.requiredTier).toBe('identity');
  });

  it('identity-verified may bid at/above the card ceiling', () => {
    expect(checkBidAllowed(identity, CARD_MAX_BID).allowed).toBe(true);
    expect(checkBidAllowed(identity, 100_000_000).allowed).toBe(true);
  });

  it('the identity threshold takes precedence over the card threshold', () => {
    // A registered user bidding above the card ceiling is told the binding
    // requirement is identity (the higher bar), not just a card.
    const r = checkBidAllowed(registered, CARD_MAX_BID + 1);
    expect(r.allowed).toBe(false);
    expect(r.requiredTier).toBe('identity');
  });
});
