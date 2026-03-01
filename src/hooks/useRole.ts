'use client';

import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types';

export function useRole() {
  const { profile } = useAuth();

  const role = profile?.role as UserRole | undefined;
  const isAdmin = profile?.isAdmin ?? false;
  const isSeller = role === 'seller' || isAdmin;
  const isBuyer = role === 'buyer' || isAdmin;
  const isAuctioneer = role === 'auctioneer' || isAdmin;

  function hasRole(required: UserRole | UserRole[]): boolean {
    if (!role) return false;
    if (isAdmin) return true;
    const roles = Array.isArray(required) ? required : [required];
    return roles.includes(role);
  }

  return { role, isAdmin, isSeller, isBuyer, isAuctioneer, hasRole };
}
