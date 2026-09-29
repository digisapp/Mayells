import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AUCTION_STATUS,
  LOT_STATUS,
  PROSPECT_AWAITING_STATUSES,
  PROSPECT_STATUS,
  VISIT_STATUS,
  auctionStatus,
  prospectStatus,
} from '../sales';
import { auctionStatusEnum } from '@/db/schema/auctions';
import { lotStatusEnum } from '@/db/schema/lots';
import { estateVisitStatusEnum } from '@/db/schema/estate-visits';
import { prospectStatusEnum } from '@/db/schema/seller-prospects';

describe('sales status maps', () => {
  it('cover every enum value in the schema', () => {
    expect(Object.keys(AUCTION_STATUS).sort()).toEqual([...auctionStatusEnum.enumValues].sort());
    expect(Object.keys(LOT_STATUS).sort()).toEqual([...lotStatusEnum.enumValues].sort());
    expect(Object.keys(VISIT_STATUS).sort()).toEqual([...estateVisitStatusEnum.enumValues].sort());
    expect(Object.keys(PROSPECT_STATUS).sort()).toEqual([...prospectStatusEnum.enumValues].sort());
  });

  it('shows a closed sale as settling', () => {
    expect(auctionStatus('closed').label).toBe('Settling');
  });

  it('falls back to a readable label for unknown values', () => {
    expect(prospectStatus('some_new_state')).toEqual({ label: 'Some new state', className: 'bg-gray-100 text-gray-700' });
  });

  it('awaiting statuses are real prospect statuses', () => {
    for (const s of PROSPECT_AWAITING_STATUSES) expect(prospectStatusEnum.enumValues).toContain(s);
  });

  it('the badge query builds its awaiting list from PROSPECT_AWAITING_STATUSES', () => {
    const badges = readFileSync(join(__dirname, '../../badges.ts'), 'utf8');
    expect(badges).toMatch(/sql\.join\(PROSPECT_AWAITING_STATUSES\.map/);
    const inList = /status in \(([^)]*)\)\)::int\s+as prospects_awaiting/.exec(badges)?.[1];
    // Bound parameters, never a hand-typed copy of the list.
    expect(inList?.trim()).toBe('${awaitingStatuses}');
  });
});
