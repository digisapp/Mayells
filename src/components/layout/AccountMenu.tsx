'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Gavel, Heart, LayoutDashboard, LogOut, Receipt } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { loadProfile, resetAccountProfile, type AccountProfile } from './account-profile';

function initials(profile: AccountProfile | null | undefined): string {
  const source = profile?.fullName?.trim() || profile?.email || '';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (profile?.fullName ? (parts[1]?.[0] ?? '') : '')).toUpperCase() || '·';
}

const ITEM = 'min-h-10 cursor-pointer gap-3 px-3 text-[14px] focus:bg-secondary focus:text-foreground';

/**
 * The desktop header's account control for a signed-in visitor: initials
 * (and first name from lg), opening a menu of their pages and Sign out.
 * Loaded only when a session cookie is present, so anonymous visitors never
 * download the dropdown. `onSignedOut` also fires when the cookie turns out
 * to be stale (the profile lookup is refused).
 */
export function AccountMenu({ onSignedOut }: { onSignedOut: () => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AccountProfile | null | undefined>(undefined);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let live = true;
    loadProfile().then((p) => {
      if (!live) return;
      setProfile(p);
      if (p === null) {
        resetAccountProfile();
        onSignedOut();
      }
    });
    return () => {
      live = false;
    };
  }, [onSignedOut]);

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    resetAccountProfile();
    setSigningOut(false);
    onSignedOut();
    router.refresh();
  }

  const firstName = profile?.fullName?.trim().split(/\s+/)[0];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className="inline-flex h-11 items-center gap-2 rounded-full pl-1.5 pr-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-champagne data-[state=open]:bg-secondary data-[state=open]:text-foreground"
        aria-label="Your account"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-charcoal text-[12px] font-semibold tracking-wide text-white"
        >
          {initials(profile)}
        </span>
        {firstName && <span className="hidden max-w-[8rem] truncate font-medium lg:inline">{firstName}</span>}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl p-1.5 shadow-luxury">
        <DropdownMenuLabel className="px-3 py-2.5 font-normal">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Signed in
          </span>
          <span className="mt-1 block truncate text-[14px] font-medium text-foreground">
            {profile?.fullName || profile?.email || 'Your account'}
          </span>
          {profile?.fullName && <span className="block truncate text-[13px] text-muted-foreground">{profile.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={ITEM}>
          <Link href="/my-bids">
            <Gavel /> My bids
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href="/watchlist">
            <Heart /> Watchlist
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href="/invoices">
            <Receipt /> Invoices
          </Link>
        </DropdownMenuItem>
        {profile?.isAdmin && (
          <DropdownMenuItem asChild className={ITEM}>
            <Link href="/admin">
              <LayoutDashboard /> Admin dashboard
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={ITEM}
          disabled={signingOut}
          onSelect={(e) => {
            // Keep the menu open to show progress; signOut closes the account.
            e.preventDefault();
            void signOut();
          }}
        >
          <LogOut /> {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
