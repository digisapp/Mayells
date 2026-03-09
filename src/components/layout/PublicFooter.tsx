import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="relative border-t border-border/40 bg-secondary/30 mt-20">
      <div className="absolute top-0 left-0 right-0 gradient-line" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <h3 className="font-logo text-xl mb-1">MAYELL</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-3">Fine Art Antiques Design Fashion Collectibles</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Luxury auctions and private sales for fine art, antiques, jewelry, watches, and design.
            </p>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">Browse</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/auctions" className="hover:text-foreground transition-colors duration-300">Auctions</Link></li>
              <li><Link href="/gallery" className="hover:text-foreground transition-colors duration-300">Gallery</Link></li>
              <li><Link href="/lots" className="hover:text-foreground transition-colors duration-300">Browse Lots</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">Selling & Services</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/consign" className="hover:text-foreground transition-colors duration-300">Consign an Item</Link></li>
              <li><Link href="/services" className="hover:text-foreground transition-colors duration-300">Professional Services</Link></li>
              <li><Link href="/about" className="hover:text-foreground transition-colors duration-300">About Mayell</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">Legal</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/terms" className="hover:text-foreground transition-colors duration-300">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-foreground transition-colors duration-300">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/40 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-muted-foreground">
            &copy; {new Date().getFullYear()} Mayell. All rights reserved.
          </p>
          <div className="flex gap-6 text-[13px] text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors duration-300">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors duration-300">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
