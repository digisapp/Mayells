/**
 * One label and one badge color per status for the sales side of the admin
 * (prospects, appraisal visits, lots, auctions). Every list, detail page and
 * dashboard card reads from here so a status never looks different depending
 * on which page you're on. Safe on server and client.
 */

export interface StatusMeta {
  label: string;
  /** Tailwind classes for a <Badge>. */
  className: string;
}

const FALLBACK_CLASS = 'bg-gray-100 text-gray-700';

function lookup<T extends string>(map: Record<T, StatusMeta>, status: string): StatusMeta {
  return (
    (map as Record<string, StatusMeta>)[status] ?? {
      label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' '),
      className: FALLBACK_CLASS,
    }
  );
}

// ── Seller prospects (funnel order) ──

export type ProspectStatusKey =
  | 'new'
  | 'contacted'
  | 'upload_sent'
  | 'items_received'
  | 'under_review'
  | 'agreement_sent'
  | 'agreement_signed'
  | 'accepted'
  | 'declined'
  | 'archived';

export const PROSPECT_STATUS: Record<ProspectStatusKey, StatusMeta> = {
  new: { label: 'New', className: 'bg-gray-100 text-gray-700' },
  contacted: { label: 'Contacted', className: 'bg-blue-100 text-blue-700' },
  upload_sent: { label: 'Upload link sent', className: 'bg-yellow-100 text-yellow-700' },
  items_received: { label: 'Items received', className: 'bg-orange-100 text-orange-700' },
  under_review: { label: 'Under review', className: 'bg-purple-100 text-purple-700' },
  agreement_sent: { label: 'Agreement sent', className: 'bg-indigo-100 text-indigo-700' },
  agreement_signed: { label: 'Agreement signed', className: 'bg-green-100 text-green-700' },
  accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-500' },
};

export const PROSPECT_STATUS_ORDER = Object.keys(PROSPECT_STATUS) as ProspectStatusKey[];

/** Statuses that need a human — the dashboard / sidebar "awaiting" count. */
export const PROSPECT_AWAITING_STATUSES: ProspectStatusKey[] = ['new', 'items_received', 'under_review'];

export const prospectStatus = (status: string) => lookup(PROSPECT_STATUS, status);

// ── Appraisal (estate) visits ──

export type VisitStatusKey = 'draft' | 'uploading' | 'processing' | 'review' | 'sent' | 'archived';

export const VISIT_STATUS: Record<VisitStatusKey, StatusMeta> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  uploading: { label: 'Uploading', className: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', className: 'bg-yellow-100 text-yellow-700' },
  review: { label: 'In review', className: 'bg-orange-100 text-orange-700' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-700' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-500' },
};

export const VISIT_STATUS_ORDER = Object.keys(VISIT_STATUS) as VisitStatusKey[];

export const visitStatus = (status: string) => lookup(VISIT_STATUS, status);

// ── Lots ──

export type LotStatusKey =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'for_sale'
  | 'in_auction'
  | 'sold'
  | 'unsold'
  | 'withdrawn';

export const LOT_STATUS: Record<LotStatusKey, StatusMeta> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-800' },
  pending_review: { label: 'Needs review', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-800' },
  for_sale: { label: 'For sale', className: 'bg-green-100 text-green-800' },
  in_auction: { label: 'In auction', className: 'bg-purple-100 text-purple-800' },
  sold: { label: 'Sold', className: 'bg-emerald-100 text-emerald-800' },
  unsold: { label: 'Unsold', className: 'bg-red-100 text-red-800' },
  withdrawn: { label: 'Withdrawn', className: 'bg-gray-100 text-gray-600' },
};

export const lotStatus = (status: string) => lookup(LOT_STATUS, status);

// ── Auctions ──

export type AuctionStatusKey =
  | 'draft'
  | 'scheduled'
  | 'preview'
  | 'open'
  | 'live'
  | 'closing'
  | 'closed'
  | 'completed'
  | 'cancelled';

// `closed` is not terminal: the lifecycle cron settles the lots (invoices,
// payouts) and then moves the sale to `completed`, so staff see "Settling".
export const AUCTION_STATUS: Record<AuctionStatusKey, StatusMeta> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-800' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
  preview: { label: 'Preview', className: 'bg-indigo-100 text-indigo-800' },
  open: { label: 'Open', className: 'bg-green-100 text-green-800' },
  live: { label: 'Live', className: 'bg-red-100 text-red-800' },
  closing: { label: 'Closing', className: 'bg-orange-100 text-orange-800' },
  closed: { label: 'Settling', className: 'bg-orange-100 text-orange-800' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-600' },
};

export const auctionStatus = (status: string) => lookup(AUCTION_STATUS, status);
