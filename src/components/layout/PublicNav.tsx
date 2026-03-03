'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Search, User, Menu, X } from 'lucide-react';
import { useState } from 'react';

const categories = [
  { label: 'Art', href: '/categories/art' },
  { label: 'Antiques', href: '/categories/antiques' },
  { label: 'Luxury', href: '/categories/luxury' },
  { label: 'Fashion', href: '/categories/fashion' },
  { label: 'Jewelry', href: '/categories/jewelry' },
  { label: 'Design', href: '/categories/design' },
];

export function PublicNav() {
  const { isAuthenticated, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="font-display text-2xl tracking-[0.15em]">
            MAYELLS
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="/gallery"
              className="text-[13px] uppercase tracking-wider text-champagne hover:text-champagne/80 font-semibold transition-colors duration-300"
            >
              Gallery
            </Link>
            <Link
              href="/private-sales"
              className="text-[13px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Private Sales
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="text-[13px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-300"
              >
                {cat.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/search">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <Search className="h-4.5 w-4.5" />
              </Button>
            </Link>

            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline text-[13px]">{profile?.displayName || profile?.fullName || 'Account'}</span>
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-[13px]">Sign In</Button>
                </Link>
                <Link href="/signup">
                  <Button variant="champagne" size="sm" className="text-[13px]">Register</Button>
                </Link>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <nav className="md:hidden pb-4 pt-2 border-t border-border/30 space-y-0.5 animate-fade-in">
            <Link
              href="/gallery"
              className="block py-2.5 px-2 text-sm font-semibold text-champagne hover:bg-muted/50 rounded-lg transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Gallery
            </Link>
            <Link
              href="/private-sales"
              className="block py-2.5 px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              Private Sales
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="block py-2.5 px-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {cat.label}
              </Link>
            ))}
            <div className="border-t border-border/30 mt-2 pt-2">
              <Link
                href="/auctions"
                className="block py-2.5 px-2 text-sm font-medium hover:bg-muted/50 rounded-lg"
                onClick={() => setMobileOpen(false)}
              >
                All Auctions
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
