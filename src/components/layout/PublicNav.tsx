'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Search, User, Menu, X } from 'lucide-react';
import { useState } from 'react';

const navLinks = [
  { label: 'Gallery', href: '/gallery' },
  { label: 'How to Buy', href: '/how-to-buy' },
  { label: 'Consign', href: '/consign' },
];

export function PublicNav() {
  const { isAuthenticated, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="font-logo text-2xl">
            MAYELL
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-300"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/search">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-10 w-10">
                <Search className="h-4.5 w-4.5" />
              </Button>
            </Link>

            {isAuthenticated ? (
              <Link href="/dashboard" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                  <User className="h-4 w-4" />
                  <span className="text-[13px]">{profile?.displayName || profile?.fullName || 'Account'}</span>
                </Button>
              </Link>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
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
              className="md:hidden h-10 w-10"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <nav className="md:hidden pb-5 pt-3 border-t border-border/30 animate-fade-in">
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
            </div>
            <div className="mt-4 pt-4 border-t border-border/30 px-3">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 py-3 text-[15px] text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" />
                  {profile?.displayName || profile?.fullName || 'My Account'}
                </Link>
              ) : (
                <div className="flex gap-3">
                  <Link href="/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" size="lg" className="w-full text-[14px]">Sign In</Button>
                  </Link>
                  <Link href="/signup" className="flex-1" onClick={() => setMobileOpen(false)}>
                    <Button variant="champagne" size="lg" className="w-full text-[14px]">Register</Button>
                  </Link>
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
