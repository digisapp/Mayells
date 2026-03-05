import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="border-t border-border/40 bg-secondary/30 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <h3 className="font-logo text-xl mb-4">MAYELLS</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The auction house of the future. AI-powered luxury auctions for art, antiques, fashion, jewelry, and design.
            </p>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">Categories</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/categories/art" className="hover:text-foreground transition-colors duration-300">Art</Link></li>
              <li><Link href="/categories/antiques" className="hover:text-foreground transition-colors duration-300">Antiques</Link></li>
              <li><Link href="/categories/luxury" className="hover:text-foreground transition-colors duration-300">Luxury</Link></li>
              <li><Link href="/categories/fashion" className="hover:text-foreground transition-colors duration-300">Fashion</Link></li>
              <li><Link href="/categories/jewelry" className="hover:text-foreground transition-colors duration-300">Jewelry</Link></li>
              <li><Link href="/categories/design" className="hover:text-foreground transition-colors duration-300">Design</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">Buying</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/auctions" className="hover:text-foreground transition-colors duration-300">Current Auctions</Link></li>
              <li><Link href="/lots" className="hover:text-foreground transition-colors duration-300">Browse Lots</Link></li>
              <li><Link href="/about" className="hover:text-foreground transition-colors duration-300">How to Bid</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">Selling</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/consign/new" className="hover:text-foreground transition-colors duration-300">Consign an Item</Link></li>
              <li><Link href="/about" className="hover:text-foreground transition-colors duration-300">About Mayells</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/40 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-muted-foreground">
            &copy; {new Date().getFullYear()} Mayells. All rights reserved.
          </p>
          <div className="flex gap-6 text-[13px] text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors duration-300">Terms</Link>
            <Link href="/about" className="hover:text-foreground transition-colors duration-300">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
