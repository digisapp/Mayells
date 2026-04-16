import type { Metadata } from 'next';
import { Inter, Playfair_Display, Cormorant_Garamond } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600', '700'],
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mayells.com';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Mayells | Fine Art Antiques Design Fashion Collectibles',
    template: '%s | Mayells',
  },
  description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design. Free appraisals and estate evaluations.',
  keywords: ['auction', 'fine art', 'antiques', 'jewelry', 'watches', 'collectibles', 'consignment', 'estate sale', 'appraisal', 'LiveAuctioneers'],
  openGraph: {
    type: 'website',
    siteName: 'Mayells',
    url: BASE_URL,
    locale: 'en_US',
    images: [{
      url: `${BASE_URL}/opengraph-image`,
      width: 1200,
      height: 630,
      alt: 'Mayells — Fine Art, Antiques, Jewelry, Collectibles',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [`${BASE_URL}/opengraph-image`],
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'Mayell',
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} ${cormorant.variable} font-sans`}>
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster position="top-right" />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
