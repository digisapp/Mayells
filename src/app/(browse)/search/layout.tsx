import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search the Mayells catalog. Find fine art, antiques, jewelry, watches, fashion, and collectibles across all auctions and gallery items.',
  alternates: { canonical: `${BASE_URL}/search` },
  // Search result pages with dynamic query params should not be indexed individually
  robots: { index: false, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
