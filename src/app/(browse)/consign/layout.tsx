import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Consign With Us',
  description: 'Consign your fine art, antiques, jewelry, and collectibles with Mayell. Free appraisals, expert cataloging, and global buyers.',
  openGraph: {
    title: 'Consign With Mayells',
    description: 'Free appraisals and consignment for fine art, antiques, jewelry, and collectibles. Sell with confidence.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Consign With Mayells',
    description: 'Free appraisals and consignment for fine art, antiques, jewelry, and collectibles.',
  },
};

export default function ConsignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
