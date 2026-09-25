import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  // Ephemeral, sign-in-gated and 404 once the sale ends: nothing to index.
  robots: { index: false, follow: true },
};

// Tint Safari's bars to the saleroom instead of the light site.
export const viewport: Viewport = {
  themeColor: '#0E1117',
};

/**
 * The live saleroom (/live/[auctionId]) gets its own chrome rather than the
 * shop's: the viewer is a full-screen app of its own (stream, bid, chat), and
 * inside the announcement bar, sticky nav, footer and chat bubble it scrolled
 * as a page on phones, pushed the chat input below the fold and hid Send
 * behind the bubble. The viewer draws its own slim header with an Exit link.
 * Fonts and the Toaster come from the root layout.
 */
export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-dvh bg-background text-foreground scheme-dark">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-lg focus:bg-champagne focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#0E1117] focus:shadow-lg"
      >
        Skip to main content
      </a>
      {children}
    </div>
  );
}
