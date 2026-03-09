import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search the Mayell Auctions catalog. Find fine art, antiques, jewelry, watches, fashion, and collectibles across all auctions and gallery items.',
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
