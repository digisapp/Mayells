import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { PublicNav } from '@/components/layout/PublicNav';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { ChatWidget } from '@/components/chat/ChatWidget';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayellauctions.com';

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Mayell Auctions',
  url: BASE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${BASE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

const businessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${BASE_URL}/#business`,
  name: 'Mayell Auctions',
  url: BASE_URL,
  telephone: '+15612204622',
  email: 'info@mayellauctions.com',
  description: 'Luxury auction house specializing in consignment sales of fine art, antiques, jewelry, watches, fashion, and collectibles on LiveAuctioneers.',
  priceRange: '$$$$',
  areaServed: 'US',
};

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-champagne focus:text-charcoal focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }} />
      <AnnouncementBar />
      <PublicNav />
      <main id="main-content" className="flex-1">{children}</main>
      <PublicFooter />
      <ChatWidget />
    </div>
  );
}
