/**
 * JSON-LD structured data generators for SEO and AI agent discoverability.
 *
 * These generate Schema.org markup so that AI agents (ChatGPT, Gemini, Perplexity)
 * and search engines can understand lot listings, auctions, and pricing natively.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

/**
 * Generate Product + Offer schema for an auction lot.
 * This is what makes a lot discoverable by AI shopping agents.
 */
export function generateLotJsonLd(lot: {
  id: string;
  title: string;
  description: string;
  slug?: string | null;
  artist?: string | null;
  maker?: string | null;
  period?: string | null;
  origin?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  condition?: string | null;
  conditionNotes?: string | null;
  primaryImageUrl?: string | null;
  images?: { url: string }[];
  estimateLow?: number | null;
  estimateHigh?: number | null;
  currentBidAmount?: number | null;
  buyNowPrice?: number | null;
  hammerPrice?: number | null;
  bidCount?: number | null;
  status: string;
  saleType: string;
  categoryName?: string | null;
}) {
  const url = `${APP_URL}/gallery/${lot.slug || lot.id}`;
  const imageUrls = lot.images?.map(i => i.url) || (lot.primaryImageUrl ? [lot.primaryImageUrl] : []);

  const isAvailable = ['for_sale', 'in_auction', 'approved'].includes(lot.status);
  const isSold = lot.status === 'sold';

  // Condition mapping to Schema.org OfferItemCondition
  const conditionMap: Record<string, string> = {
    mint: 'https://schema.org/NewCondition',
    excellent: 'https://schema.org/UsedCondition',
    very_good: 'https://schema.org/UsedCondition',
    good: 'https://schema.org/UsedCondition',
    fair: 'https://schema.org/UsedCondition',
    poor: 'https://schema.org/DamagedCondition',
    as_is: 'https://schema.org/DamagedCondition',
  };

  const product: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: lot.title,
    description: lot.description?.slice(0, 5000),
    url,
    image: imageUrls,
    brand: lot.artist || lot.maker ? {
      '@type': lot.artist ? 'Person' : 'Organization',
      name: lot.artist || lot.maker,
    } : undefined,
    category: lot.categoryName || undefined,
    material: lot.medium || undefined,
    countryOfOrigin: lot.origin ? {
      '@type': 'Country',
      name: lot.origin,
    } : undefined,
    itemCondition: lot.condition ? conditionMap[lot.condition] : undefined,
  };

  // Add size/dimensions
  if (lot.dimensions) {
    product.size = lot.dimensions;
  }

  // Add offers
  if (lot.saleType === 'gallery' && lot.buyNowPrice) {
    product.offers = {
      '@type': 'Offer',
      price: (lot.buyNowPrice / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      seller: {
        '@type': 'Organization',
        name: 'Mayells',
      },
    };
  } else if (lot.saleType === 'auction') {
    product.offers = {
      '@type': 'AggregateOffer',
      lowPrice: lot.estimateLow ? (lot.estimateLow / 100).toFixed(2) : undefined,
      highPrice: lot.estimateHigh ? (lot.estimateHigh / 100).toFixed(2) : undefined,
      priceCurrency: 'USD',
      availability: isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      offerCount: lot.bidCount || 0,
    };

    if (isSold && lot.hammerPrice) {
      product.offers = {
        '@type': 'Offer',
        price: (lot.hammerPrice / 100).toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/SoldOut',
      };
    }
  }

  // Add additional properties
  if (lot.period) {
    product.additionalProperty = [
      ...(Array.isArray(product.additionalProperty) ? product.additionalProperty as unknown[] : []),
      { '@type': 'PropertyValue', name: 'Period', value: lot.period },
    ];
  }

  return product;
}

/**
 * Generate Event schema for an auction.
 */
export function generateAuctionJsonLd(auction: {
  id: string;
  title: string;
  description?: string | null;
  slug?: string | null;
  type: string;
  status: string;
  biddingStartsAt?: Date | null;
  biddingEndsAt?: Date | null;
  coverImageUrl?: string | null;
  lotCount?: number | null;
}) {
  const url = `${APP_URL}/auctions/${auction.slug || auction.id}`;
  const isUpcoming = ['scheduled', 'preview'].includes(auction.status);
  const isLive = ['open', 'live'].includes(auction.status);

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: auction.title,
    description: auction.description?.slice(0, 5000) || `Online auction featuring ${auction.lotCount || 'multiple'} lots`,
    url,
    image: auction.coverImageUrl || undefined,
    startDate: auction.biddingStartsAt?.toISOString(),
    endDate: auction.biddingEndsAt?.toISOString(),
    eventStatus: isLive
      ? 'https://schema.org/EventMovedOnline'
      : isUpcoming
        ? 'https://schema.org/EventScheduled'
        : 'https://schema.org/EventCancelled',
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: {
      '@type': 'VirtualLocation',
      url,
    },
    organizer: {
      '@type': 'Organization',
      name: 'Mayells',
      url: APP_URL,
    },
    offers: {
      '@type': 'Offer',
      url,
      price: '0',
      priceCurrency: 'USD',
      availability: isUpcoming || isLive
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
      validFrom: auction.biddingStartsAt?.toISOString(),
    },
  };
}

/**
 * Generate BreadcrumbList for navigation context.
 */
export function generateBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${APP_URL}${item.url}`,
    })),
  };
}
