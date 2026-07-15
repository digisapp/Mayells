import { describe, it, expect } from 'vitest';
import { computeOutbidRecipients } from '../notify-outbid';

const A = 'bidder-A';
const B = 'bidder-B';
const C = 'bidder-C';

describe('computeOutbidRecipients', () => {
  it('notifies the prior leader when a higher bid displaces them', () => {
    // A was leading; B bids over A's max and wins.
    const r = computeOutbidRecipients({
      priorHighBidderId: A,
      priorAmount: 10_000,
      requesterId: B,
      requesterAmount: 15_000,
      finalHighBidderId: B,
    });
    expect(r).toEqual([{ bidderId: A, yourBid: 10_000 }]);
  });

  it("notifies the requester when a rival's proxy instantly outbids them", () => {
    // A holds a high max and is leading; B bids but A's proxy defends the top.
    const r = computeOutbidRecipients({
      priorHighBidderId: A,
      priorAmount: 10_000,
      requesterId: B,
      requesterAmount: 12_000,
      finalHighBidderId: A, // A still leads after proxy war
    });
    expect(r).toEqual([{ bidderId: B, yourBid: 12_000 }]);
  });

  it('notifies BOTH the prior leader and the requester when a third party wins', () => {
    // A was leading; B bids; C's proxy wins. Both A and B lost.
    const r = computeOutbidRecipients({
      priorHighBidderId: A,
      priorAmount: 10_000,
      requesterId: B,
      requesterAmount: 12_000,
      finalHighBidderId: C,
    });
    expect(r).toEqual([
      { bidderId: A, yourBid: 10_000 },
      { bidderId: B, yourBid: 12_000 },
    ]);
  });

  it('notifies no one when the requester takes and keeps the lead (no prior bidder)', () => {
    // First bid on the lot — nobody was leading, requester now leads.
    const r = computeOutbidRecipients({
      priorHighBidderId: null,
      priorAmount: 0,
      requesterId: B,
      requesterAmount: 5_000,
      finalHighBidderId: B,
    });
    expect(r).toEqual([]);
  });

  it('never double-notifies the same bidder (dedup)', () => {
    // Defensive/unreachable (you can't outbid yourself), but a single id must
    // never appear twice regardless of amounts.
    const r = computeOutbidRecipients({
      priorHighBidderId: A,
      priorAmount: 10_000,
      requesterId: A,
      requesterAmount: 12_000,
      finalHighBidderId: C,
    });
    expect(r).toHaveLength(1);
    expect(r[0].bidderId).toBe(A);
  });
});
