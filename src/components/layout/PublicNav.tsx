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
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="font-display text-2xl tracking-wider">
            MAYELLS
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {categories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {cat.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/search">
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Search className="h-5 w-5" />
              </Button>
            </Link>

            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{profile?.displayName || profile?.fullName || 'Account'}</span>
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">Sign In</Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">Register</Button>
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
          <nav className="md:hidden pb-4 space-y-1">
            {categories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {cat.label}
              </Link>
            ))}
            <Link
              href="/auctions"
              className="block py-2 text-sm font-medium"
              onClick={() => setMobileOpen(false)}
            >
              All Auctions
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
