import type { Metadata, Viewport } from 'next';

// Safari tints its toolbar with this. The site default is charcoal; this
// flow has an ivory header, so match it (merged over the root viewport,
// which keeps viewportFit: 'cover').
export const viewport: Viewport = {
  themeColor: '#f8f5ee',
};

export const metadata: Metadata = {
  title: 'Upload your items | Mayells',
  // Private, tokenized pages: never in search results.
  robots: { index: false, follow: false },
};

/**
 * The seller photo-upload flow (/upload/[token]) gets its own chrome rather
 * than the shop's. It is a private task page reached from an email: the
 * catalogue nav, newsletter footer and chat bubble only compete with the one
 * thing the visitor came to do, and on a phone the chat bubble sat on top of
 * the capture buttons.
 */
export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-ivory text-charcoal">{children}</div>;
}
