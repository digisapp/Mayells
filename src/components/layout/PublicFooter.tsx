import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="border-t border-border/50 bg-surface mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-display text-xl tracking-wider mb-4">MAYELLS</h3>
            <p className="text-sm text-muted-foreground">
              The auction house of the future. AI-powered luxury auctions for art, antiques, fashion, jewelry, and design.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-3">Categories</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/categories/art" className="hover:text-foreground transition-colors">Art</Link></li>
              <li><Link href="/categories/antiques" className="hover:text-foreground transition-colors">Antiques</Link></li>
              <li><Link href="/categories/luxury" className="hover:text-foreground transition-colors">Luxury</Link></li>
              <li><Link href="/categories/fashion" className="hover:text-foreground transition-colors">Fashion</Link></li>
              <li><Link href="/categories/jewelry" className="hover:text-foreground transition-colors">Jewelry</Link></li>
              <li><Link href="/categories/design" className="hover:text-foreground transition-colors">Design</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-3">Buying</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/auctions" className="hover:text-foreground transition-colors">Current Auctions</Link></li>
              <li><Link href="/lots" className="hover:text-foreground transition-colors">Browse Lots</Link></li>
              <li><Link href="/about" className="hover:text-foreground transition-colors">How to Bid</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-3">Selling</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/consign/new" className="hover:text-foreground transition-colors">Consign an Item</Link></li>
              <li><Link href="/about" className="hover:text-foreground transition-colors">About Mayells</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/50 mt-8 pt-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Mayells. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
