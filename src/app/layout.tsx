import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import localFont from 'next/font/local';
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

const alteHaas = localFont({
  src: [
    { path: '../../public/fonts/AlteHaasGroteskRegular.ttf', weight: '400' },
    { path: '../../public/fonts/AlteHaasGroteskBold.ttf', weight: '700' },
  ],
  variable: '--font-alte-haas',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Mayell Auctions | Fine Art Antiques Design Fashion Collectibles',
    template: '%s | Mayell Auctions',
  },
  description: 'Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design. Free appraisals and estate evaluations.',
  openGraph: {
    type: 'website',
    siteName: 'Mayell Auctions',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} ${alteHaas.variable} font-sans`}>
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
