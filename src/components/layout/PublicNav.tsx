'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, Menu, X, Heart, Gavel, Phone, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BUSINESS } from '@/lib/config';
import { hasSessionCookie, loadProfile, resetAccountProfile, sessionKey, signInHref } from './account-profile';

// The dropdown (Radix) loads only for a signed-in visitor. The placeholder
// holds the trigger's size so the header doesn't shift when it arrives.
const AccountMenu = dynamic(() => import('./AccountMenu').then((m) => m.AccountMenu), {
  ssr: false,
  loading: () => (
    <span aria-hidden className="inline-flex h-11 w-[3.75rem] items-center pl-1.5">
      <span className="size-8 rounded-full bg-secondary" />
    </span>
  ),
});

const navLinks = [
  { label: 'Auctions', href: '/auctions' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'How to Buy', href: '/how-to-buy' },
  { label: 'About', href: '/about' },
];

const MENU_ID = 'site-mobile-menu';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The menu's account row: undefined until first checked, null when signed out.
type Account = { email: string | null } | null;

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [account, setAccount] = useState<Account | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);
  // Desktop account slot: undefined until mounted (the server can't see the
  // cookie on a cached page), then the session cookie's key, or null.
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Any navigation closes the menu — back-swipe and programmatic pushes as
  // well as taps — so it can't survive onto the next page with the scroll
  // lock still on. Adjusted during render so the new page never paints a
  // frame with the old menu over it.
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMobileOpen(false);
  }

  // Re-read on every navigation (signing in or out ends in one) and when the
  // tab regains focus (a sign-in or sign-out in another tab).
  useEffect(() => {
    const check = () => setSession(sessionKey());
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [pathname]);

  const handleSignedOut = useCallback(() => {
    setSession(null);
    setAccount(null);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // A layout effect so the sheet is placed before the first paint.
  useLayoutEffect(() => {
    if (!mobileOpen) return;
    const html = document.documentElement;
    const header = headerRef.current;
    const menu = menuRef.current;

    // Lock page scroll so the menu doesn't float over a scrolling page;
    // data-menu-open lets globals.css hide the chat bubble.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    html.setAttribute('data-menu-open', '');

    // The sheet fills the viewport from the header's bottom edge, which sits
    // lower while the (non-sticky) announcement bar is still on screen.
    // Measured now, with the header in its open styling.
    const place = () => {
      if (header && menu) menu.style.top = `${header.getBoundingClientRect().bottom}px`;
    };
    place();

    // Everything beside the header and menu is covered, so take it out of
    // the VoiceOver swipe order too (Tab is trapped below).
    const madeInert: Element[] = [];
    for (const el of Array.from(header?.parentElement?.children ?? [])) {
      if (el === header || el === menu || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      madeInert.push(el);
    }

    menu?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [header, menu]
        .flatMap((root) => (root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : []))
        .filter((el) => el.getClientRects().length > 0);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !items.includes(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Rotation changes the header's height (and past lg hides the toggle
    // entirely, which would strand the page behind an invisible menu).
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => {
      if (desktop.matches) setMobileOpen(false);
      else place();
    };

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prevOverflow;
      html.removeAttribute('data-menu-open');
      for (const el of madeInert) el.removeAttribute('inert');
    };
  }, [mobileOpen]);

  // Re-checked on each open because the header persists across sign-in and
  // sign-out. No cookie means signed out without asking the server.
  function refreshAccount() {
    if (!hasSessionCookie()) {
      setAccount(null);
      return;
    }
    loadProfile().then((p) => {
      if (!p) resetAccountProfile();
      setAccount(p ? { email: p.email || null } : null);
    });
  }

  function toggleMenu() {
    if (mobileOpen) {
      setMobileOpen(false);
      toggleRef.current?.focus();
      return;
    }
    setMobileOpen(true);
    refreshAccount();
  }

  // Any link in the header or menu closes it, including ones to the current
  // page, where the pathname doesn't change.
  function closeOnLinkClick(e: React.MouseEvent) {
    if ((e.target as Element).closest('a')) setMobileOpen(false);
  }

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    resetAccountProfile();
    setSigningOut(false);
    handleSignedOut();
    setMobileOpen(false);
    router.refresh();
  }

  return (
    <>
      <header
        ref={headerRef}
        onClick={closeOnLinkClick}
        // Colours and blur animate; border widths deliberately don't, so the
        // header has its final height when the menu sheet is placed under it.
        className={`sticky top-0 z-50 transition-[color,background-color,border-color,box-shadow,backdrop-filter] duration-300 ${
          mobileOpen
            ? 'bg-background border-b border-border/60'
            : scrolled
              ? 'glass border-b border-border/30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
              : 'bg-background/80 backdrop-blur-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            {/* Logo */}
            <Link href="/" className="flex h-11 items-center font-logo text-2xl tracking-[0.15em]">
              MAYELLS
            </Link>

            {/* Desktop nav — centered. From lg only: below that the links,
                icons and buttons need ~820px, wider than a portrait iPad or
                a landscape iPhone inside its notch insets, so the menu
                covers the tablet range too. */}
            <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-10">
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

            {/* Right actions. The negative margin lines the menu glyph up with
                the page gutter instead of its 44px box edge. */}
            <div className="flex items-center gap-1 sm:gap-2 -mr-2.5 lg:mr-0">
              <Button asChild variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-foreground">
                <Link href="/search" aria-label="Search">
                  <Search className="h-[18px] w-[18px]" />
                </Link>
              </Button>

              <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex size-11 text-muted-foreground hover:text-foreground">
                <Link href="/my-bids" aria-label="My bids">
                  <Gavel className="h-[18px] w-[18px]" />
                </Link>
              </Button>

              <Button asChild variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-foreground">
                <Link href="/watchlist" aria-label="My watchlist">
                  <Heart className="h-[18px] w-[18px]" />
                </Link>
              </Button>

              {/* Faded in once the session is known, so a signed-in
                  visitor never sees "Sign In" flash on a cached page. */}
              <div
                className={`hidden sm:flex items-center transition-opacity duration-200 ${session === undefined ? 'opacity-0' : 'opacity-100'}`}
              >
                {session ? (
                  // Keyed on the session, so a different sign-in (another
                  // tab, another account) remounts it with a fresh profile.
                  <AccountMenu key={session} onSignedOut={handleSignedOut} />
                ) : (
                  <Button asChild variant="ghost" size="sm" className="h-11 px-3 text-[13px] text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <Link href={signInHref(pathname)}>Sign In</Link>
                  </Button>
                )}
              </div>

              <Button asChild variant="champagne" size="sm" className="hidden sm:inline-flex text-[13px]">
                <Link href="/consign">Sell With Us</Link>
              </Button>

              <Button
                ref={toggleRef}
                variant="ghost"
                size="icon"
                className="lg:hidden size-11"
                onClick={toggleMenu}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileOpen}
                aria-controls={MENU_ID}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/*
        Mobile menu: a solid sheet from the header's bottom edge to the bottom
        of the viewport, scrolling internally on short and landscape screens.
        A sibling of the header rather than a child: the header's blur and
        transition would otherwise become the containing block for this
        fixed element and pin it to the header's box.
      */}
      <div
        id={MENU_ID}
        ref={menuRef}
        hidden={!mobileOpen}
        onClick={closeOnLinkClick}
        className="lg:hidden fixed inset-x-0 bottom-0 z-[60] overflow-y-auto overscroll-contain bg-background motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.75rem)]">
          <nav aria-label="Mobile navigation">
            <ul>
              {navLinks.map((link) => (
                <li key={link.href} className="border-b border-border">
                  <Link
                    href={link.href}
                    aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}
                    className="group flex min-h-14 items-center justify-between font-display text-[22px] text-foreground transition-colors aria-[current=page]:text-champagne-deep"
                  >
                    {link.label}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-aria-[current=page]:text-champagne-deep" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-2 grid grid-cols-2 gap-x-4">
              <li>
                <Link href="/my-bids" className="flex min-h-11 items-center gap-2.5 text-[15px] text-muted-foreground transition-colors hover:text-foreground">
                  <Gavel className="h-4 w-4" aria-hidden />
                  My Bids
                </Link>
              </li>
              <li>
                <Link href="/watchlist" className="flex min-h-11 items-center gap-2.5 text-[15px] text-muted-foreground transition-colors hover:text-foreground">
                  <Heart className="h-4 w-4" aria-hidden />
                  My Watchlist
                </Link>
              </li>
            </ul>
          </nav>

          <div className="mt-6 grid gap-3">
            <Button asChild variant="champagne" size="lg" className="h-12 w-full">
              <Link href="/consign">Sell With Us</Link>
            </Button>
            <a
              href={BUSINESS.phoneHref}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              <Phone className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{BUSINESS.phone}</span>
            </a>
          </div>
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            Free appraisals &middot; Palm Beach &amp; New York
          </p>

          {/* Account. The row keeps its height while the session is checked
              so the sheet doesn't jump when it resolves. */}
          <div className="mt-6 flex min-h-11 items-center justify-between gap-4 border-t border-border pt-3">
            {account === null && (
              <>
                <Link href={signInHref(pathname)} className="flex min-h-11 items-center text-[15px] font-medium text-foreground">
                  Sign In
                </Link>
                <Link href="/signup" className="flex min-h-11 items-center text-[14px] text-muted-foreground transition-colors hover:text-foreground">
                  Create an account
                </Link>
              </>
            )}
            {account && (
              <>
                <p className="min-w-0 truncate text-[13px] text-muted-foreground">
                  Signed in{account.email ? <> as <span className="text-foreground">{account.email}</span></> : null}
                </p>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="flex min-h-11 shrink-0 items-center text-[14px] font-medium text-foreground disabled:opacity-50"
                >
                  {signingOut ? 'Signing out…' : 'Sign Out'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
