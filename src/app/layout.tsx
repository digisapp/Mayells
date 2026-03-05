import type { Metadata } from 'next';
import { Inter, Playfair_Display, Cinzel } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/context/AuthContext';
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

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Mayells — The Auction House of the Future',
    template: '%s — Mayells',
  },
  description: 'AI-powered luxury auctions for Art, Antiques, Fashion, Jewelry, and Design. Live and timed auctions with a modern experience.',
  openGraph: {
    type: 'website',
    siteName: 'Mayells',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} ${cinzel.variable} font-sans`}>
        <AuthProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </AuthProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
