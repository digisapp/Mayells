import { describe, it, expect } from 'vitest';
import { generateAuctionJsonLd, generateLotJsonLd } from '../structured-data';

const lot = (over: Partial<Parameters<typeof generateLotJsonLd>[0]> = {}) => ({
  id: 'lot-1',
  title: 'A Vase',
  description: 'Blue and white.',
  slug: 'a-vase',
  status: 'in_auction',
  saleType: 'auction',
  ...over,
});

const auction = (over: Partial<Parameters<typeof generateAuctionJsonLd>[0]> = {}) => ({
  id: 'a1',
  title: 'Spring Sale',
  slug: 'spring-sale',
  type: 'timed',
  status: 'open',
  ...over,
});

type Offer = { availability?: string };

describe('generateLotJsonLd', () => {
  it('links the Product to the canonical lot page when the sale is known', () => {
    expect(generateLotJsonLd(lot({ auctionSlug: 'spring-sale' })).url).toMatch(/\/auctions\/spring-sale\/lots\/a-vase$/);
    expect(generateLotJsonLd(lot()).url).toMatch(/\/lots\/a-vase$/);
  });

  it('falls back to the primary image when the lot has no gallery images', () => {
    expect(generateLotJsonLd(lot({ images: [], primaryImageUrl: 'https://x/p.jpg' })).image).toEqual(['https://x/p.jpg']);
    expect(generateLotJsonLd(lot({ primaryImageUrl: 'https://x/p.jpg' })).image).toEqual(['https://x/p.jpg']);
    expect(generateLotJsonLd(lot({ images: [{ url: 'https://x/1.jpg' }], primaryImageUrl: 'https://x/p.jpg' })).image)
      .toEqual(['https://x/1.jpg']);
  });

  it('marks a preview-catalogue lot as coming, not sold out', () => {
    expect((generateLotJsonLd(lot({ status: 'approved' })).offers as Offer).availability).toBe('https://schema.org/PreOrder');
    expect((generateLotJsonLd(lot({ status: 'in_auction' })).offers as Offer).availability).toBe('https://schema.org/InStock');
    expect((generateLotJsonLd(lot({ status: 'sold' })).offers as Offer).availability).toBe('https://schema.org/SoldOut');
  });

  it('keeps gallery availability on the same rule', () => {
    const offer = generateLotJsonLd(lot({ saleType: 'gallery', status: 'for_sale', buyNowPrice: 120000 })).offers as Offer;
    expect(offer.availability).toBe('https://schema.org/InStock');
  });
});

describe('generateAuctionJsonLd', () => {
  it('calls every sale scheduled except a cancelled one', () => {
    for (const status of ['scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed']) {
      expect(generateAuctionJsonLd(auction({ status })).eventStatus).toBe('https://schema.org/EventScheduled');
    }
    expect(generateAuctionJsonLd(auction({ status: 'cancelled' })).eventStatus).toBe('https://schema.org/EventCancelled');
  });

  it('expresses online bidding as the attendance mode', () => {
    expect(generateAuctionJsonLd(auction()).eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
  });

  it("keeps a 'closed' sale with lots still closing in stock", () => {
    expect(generateAuctionJsonLd(auction({ status: 'closed', takingBids: true })).offers.availability)
      .toBe('https://schema.org/InStock');
    expect(generateAuctionJsonLd(auction({ status: 'closed', takingBids: false })).offers.availability)
      .toBe('https://schema.org/SoldOut');
  });
});
