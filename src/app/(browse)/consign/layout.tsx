import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Consign With Us',
  description: 'Consign your fine art, antiques, jewelry, and collectibles with Mayell. Free appraisals, 35% commission, global buyers on LiveAuctioneers.',
};

export default function ConsignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
