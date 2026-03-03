export type UserRole = 'buyer' | 'seller' | 'admin' | 'auctioneer';

export type AuctionStatus =
  | 'draft'
  | 'scheduled'
  | 'preview'
  | 'open'
  | 'live'
  | 'closing'
  | 'closed'
  | 'completed'
  | 'cancelled';

export type LotStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'for_sale'
  | 'in_auction'
  | 'sold'
  | 'unsold'
  | 'withdrawn';

export type SaleType = 'auction' | 'gallery' | 'private';

export type BidType = 'manual' | 'auto' | 'phone' | 'auctioneer';

export type BidStatus = 'active' | 'outbid' | 'winning' | 'won' | 'retracted';

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

export function formatCurrency(amountInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export function formatCurrencyWithCents(amountInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100);
}
