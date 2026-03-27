'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Search, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';

const navLinks = [
  { label: 'Auctions', href: '/auctions' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Consign', href: '/consign' },
  { label: 'About', href: '/about' },
];

export function PublicNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'glass border-b border-border/30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
          : 'bg-background/80 backdrop-blur-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-[72px]">
          {/* Logo */}
          <Link href="/" className="font-logo text-2xl tracking-[0.15em]">
            MAYELL
          </Link>

          {/* Desktop nav — centered */}
          <nav aria-label="Main navigation" className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors duration-300 relative after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-px after:bg-champagne after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/search" aria-label="Search">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-10 w-10">
                <Search className="h-[18px] w-[18px]" />
              </Button>
            </Link>

            <Link href="/how-to-buy" className="hidden sm:block">
              <Button variant="champagne" size="sm" className="text-[13px]">How to Buy</Button>
            </Link>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-10 w-10"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <nav aria-label="Mobile navigation" className="md:hidden pb-6 pt-4 border-t border-border/30 animate-fade-in">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block py-3 px-3 text-[15px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/how-to-buy"
                className="block py-3 px-3 text-[15px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                How to Buy
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
