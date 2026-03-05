import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.enum(['buyer', 'seller'], { message: 'Please select a role' }),
});

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const lotSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional(),
  artist: z.string().optional(),
  maker: z.string().optional(),
  period: z.string().optional(),
  circa: z.string().optional(),
  origin: z.string().optional(),
  medium: z.string().optional(),
  dimensions: z.string().optional(),
  weight: z.string().optional(),
  condition: z.enum(['mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'as_is']).optional(),
  conditionNotes: z.string().optional(),
  provenance: z.string().optional(),
  estimateLow: z.number().int().positive().optional(),
  estimateHigh: z.number().int().positive().optional(),
  reservePrice: z.number().int().positive().optional(),
  startingBid: z.number().int().positive().optional(),
  saleType: z.enum(['auction', 'gallery', 'private']).default('auction'),
  buyNowPrice: z.number().int().positive().optional(),
});

export const auctionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens'),
  type: z.enum(['timed', 'live']),
  previewStartsAt: z.string().datetime().optional(),
  biddingStartsAt: z.string().datetime().optional(),
  biddingEndsAt: z.string().datetime().optional(),
  buyerPremiumPercent: z.number().int().min(0).max(50).default(25),
  antiSnipeEnabled: z.boolean().default(true),
  antiSnipeMinutes: z.number().int().min(1).max(10).default(2),
  antiSnipeWindowMinutes: z.number().int().min(1).max(15).default(5),
});

export const bidSchema = z.object({
  amount: z.number().int().positive('Bid amount must be positive'),
  maxBidAmount: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
});

export const consignmentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  categorySlug: z.string().min(1, 'Category is required'),
  estimatedValue: z.number().int().positive().optional(),
});

export const lotUpdateSchema = lotSchema.partial().extend({
  status: z.enum(['draft', 'pending_review', 'approved', 'for_sale', 'in_auction', 'sold', 'unsold', 'withdrawn']).optional(),
  isFeatured: z.boolean().optional(),
  isHighlight: z.boolean().optional(),
  primaryImageUrl: z.string().optional(),
});

export const auctionUpdateSchema = auctionSchema.partial().extend({
  status: z.enum(['draft', 'scheduled', 'preview', 'open', 'live', 'closing', 'closed', 'completed', 'cancelled']).optional(),
  isFeatured: z.boolean().optional(),
  coverImageUrl: z.string().optional(),
  bannerImageUrl: z.string().optional(),
});

export const assignLotSchema = z.object({
  lotId: z.string().uuid(),
  lotNumber: z.number().int().positive(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LotInput = z.infer<typeof lotSchema>;
export type LotUpdateInput = z.infer<typeof lotUpdateSchema>;
export type AuctionInput = z.infer<typeof auctionSchema>;
export type AuctionUpdateInput = z.infer<typeof auctionUpdateSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type ConsignmentInput = z.infer<typeof consignmentSchema>;
