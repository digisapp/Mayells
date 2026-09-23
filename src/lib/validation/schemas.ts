import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  // Selling is never self-service (consignment goes through /consign), so
  // signup no longer asks — everyone starts as a buyer. The field is kept
  // optional for older clients; shadow-claim preserves seller status anyway.
  role: z.enum(['buyer', 'seller']).default('buyer'),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const lotBaseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().nullable().optional(),
  artist: z.string().optional(),
  maker: z.string().optional(),
  period: z.string().optional(),
  circa: z.string().optional(),
  origin: z.string().optional(),
  medium: z.string().optional(),
  dimensions: z.string().optional(),
  weight: z.string().optional(),
  // Nullable so the editor can CLEAR a value (undefined = "leave unchanged"
  // on partial updates; null = "remove").
  condition: z.enum(['mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'as_is']).nullable().optional(),
  conditionNotes: z.string().optional(),
  provenance: z.string().optional(),
  literature: z.string().optional(),
  exhibited: z.string().optional(),
  // Seller-of-record. Payouts are skipped with a warning at settlement when this
  // is missing, so the editor exposes it; null clears it.
  sellerId: z.string().uuid().nullable().optional(),
  estimateLow: z.number().int().positive().nullable().optional(),
  estimateHigh: z.number().int().positive().nullable().optional(),
  reservePrice: z.number().int().positive().nullable().optional(),
  startingBid: z.number().int().positive().nullable().optional(),
  // No .default() on base fields: zod 4 applies defaults inside .partial(), so
  // a status-only PATCH would silently rewrite them. Defaults live on create.
  saleType: z.enum(['auction', 'gallery', 'private']).optional(),
  buyNowPrice: z.number().int().positive().nullable().optional(),
  isFeatured: z.boolean().optional(),
  isHighlight: z.boolean().optional(),
});

const estimatesOrdered = (d: { estimateLow?: number | null; estimateHigh?: number | null }) =>
  d.estimateLow == null || d.estimateHigh == null || d.estimateHigh >= d.estimateLow;
const estimatesOrderedMsg = { message: 'High estimate must be at least the low estimate', path: ['estimateHigh'] };

export const lotSchema = lotBaseSchema
  .extend({ saleType: z.enum(['auction', 'gallery', 'private']).default('auction') })
  .refine(estimatesOrdered, estimatesOrderedMsg);

const auctionBaseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  liveauctioneersUrl: z.string().url('LiveAuctioneers URL must be a valid URL').or(z.literal('')).optional(),
  type: z.enum(['timed', 'live']),
  previewStartsAt: z.string().datetime().optional(),
  biddingStartsAt: z.string().datetime().optional(),
  biddingEndsAt: z.string().datetime().optional(),
  // Defaults are applied by auctionSchema (create) only; see saleType above.
  buyerPremiumPercent: z.number().int().min(0).max(50).optional(),
  antiSnipeEnabled: z.boolean().optional(),
  antiSnipeMinutes: z.number().int().min(1).max(10).optional(),
  antiSnipeWindowMinutes: z.number().int().min(1).max(15).optional(),
  // Seconds between consecutive lot closes in a staggered timed sale (0 = all
  // lots close together).
  lotClosingIntervalSeconds: z.number().int().min(0).max(3600).optional(),
  saleNumber: z.string().max(50).optional(),
  coverImageUrl: z.string().url().max(2000).or(z.literal('')).optional(),
  isFeatured: z.boolean().optional(),
});

const endsAfterStart = (d: { biddingStartsAt?: string; biddingEndsAt?: string }) =>
  !d.biddingStartsAt || !d.biddingEndsAt || new Date(d.biddingEndsAt) > new Date(d.biddingStartsAt);
const endsAfterStartMsg = { message: 'Bidding end must be after bidding start', path: ['biddingEndsAt'] };
const previewBeforeBidding = (d: { previewStartsAt?: string; biddingStartsAt?: string }) =>
  !d.previewStartsAt || !d.biddingStartsAt || new Date(d.previewStartsAt) <= new Date(d.biddingStartsAt);
const previewBeforeBiddingMsg = { message: 'Preview must open before bidding opens', path: ['previewStartsAt'] };

export const auctionSchema = auctionBaseSchema
  .extend({
    buyerPremiumPercent: z.number().int().min(0).max(50).default(25),
    antiSnipeEnabled: z.boolean().default(true),
    antiSnipeMinutes: z.number().int().min(1).max(10).default(2),
    antiSnipeWindowMinutes: z.number().int().min(1).max(15).default(5),
  })
  .refine(endsAfterStart, endsAfterStartMsg)
  .refine(previewBeforeBidding, previewBeforeBiddingMsg);

// Ceiling for any monetary field stored in an int4 column (cents). int4 maxes
// at 2,147,483,647; cap well below it ($20,000,000) so a legal higher bid — or
// a bid + increment tier — can never overflow the column and corrupt the lot.
const MAX_MONEY_CENTS = 2_000_000_000;

export const bidSchema = z.object({
  amount: z.number().int().positive('Bid amount must be positive').max(MAX_MONEY_CENTS),
  maxBidAmount: z.number().int().positive().max(MAX_MONEY_CENTS).optional(),
  idempotencyKey: z.string().max(255).optional(),
}).refine(
  (data) => data.maxBidAmount === undefined || data.maxBidAmount >= data.amount,
  { message: 'Max bid must be at least the bid amount', path: ['maxBidAmount'] },
);

export const lotUpdateSchema = lotBaseSchema.partial().extend({
  status: z.enum(['draft', 'pending_review', 'approved', 'for_sale', 'in_auction', 'sold', 'unsold', 'withdrawn']).optional(),
  primaryImageUrl: z.string().optional(),
}).refine(estimatesOrdered, estimatesOrderedMsg);

export const auctionUpdateSchema = auctionBaseSchema.partial().extend({
  status: z.enum(['draft', 'scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed', 'cancelled']).optional(),
  bannerImageUrl: z.string().url().max(2000).or(z.literal('')).optional(),
})
  .refine(endsAfterStart, endsAfterStartMsg)
  .refine(previewBeforeBidding, previewBeforeBiddingMsg);

export const assignLotSchema = z.object({
  lotId: z.string().uuid(),
  // Omit to let the server assign the next free number in the auction.
  lotNumber: z.number().int().positive().optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LotInput = z.infer<typeof lotSchema>;
export type LotUpdateInput = z.infer<typeof lotUpdateSchema>;
export type AuctionInput = z.infer<typeof auctionSchema>;
export type AuctionUpdateInput = z.infer<typeof auctionUpdateSchema>;
export type BidInput = z.infer<typeof bidSchema>;
