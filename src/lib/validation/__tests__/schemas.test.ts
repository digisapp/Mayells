import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  loginSchema,
  bidSchema,
  lotSchema,
  auctionSchema,
  consignmentSchema,
} from '../schemas';

describe('signupSchema', () => {
  it('validates a correct signup', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      fullName: 'John Doe',
      role: 'buyer',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      fullName: 'John Doe',
      role: 'buyer',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: '1234567',
      fullName: 'John Doe',
      role: 'buyer',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      fullName: 'John Doe',
      role: 'admin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty fullName', () => {
    const result = signupSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      fullName: '',
      role: 'buyer',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('validates correct login', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('bidSchema', () => {
  it('validates a valid bid', () => {
    const result = bidSchema.safeParse({ amount: 5000 });
    expect(result.success).toBe(true);
  });

  it('validates bid with max bid amount', () => {
    const result = bidSchema.safeParse({ amount: 5000, maxBidAmount: 10000 });
    expect(result.success).toBe(true);
  });

  it('rejects zero amount', () => {
    const result = bidSchema.safeParse({ amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = bidSchema.safeParse({ amount: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer amount', () => {
    const result = bidSchema.safeParse({ amount: 50.5 });
    expect(result.success).toBe(false);
  });
});

describe('lotSchema', () => {
  it('validates a minimal lot', () => {
    const result = lotSchema.safeParse({
      title: 'Fine Art Painting',
      description: 'Oil on canvas',
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('validates a lot with full data', () => {
    const result = lotSchema.safeParse({
      title: 'Fine Art Painting',
      description: 'Oil on canvas, 1920s',
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
      artist: 'Claude Monet',
      condition: 'excellent',
      estimateLow: 10000,
      estimateHigh: 20000,
      reservePrice: 8000,
      startingBid: 5000,
      saleType: 'auction',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = lotSchema.safeParse({
      title: '',
      description: 'Test',
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid condition', () => {
    const result = lotSchema.safeParse({
      title: 'Test',
      description: 'Test',
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
      condition: 'broken',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative estimates', () => {
    const result = lotSchema.safeParse({
      title: 'Test',
      description: 'Test',
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
      estimateLow: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe('auctionSchema', () => {
  it('validates a valid auction', () => {
    const result = auctionSchema.safeParse({
      title: 'Spring Fine Art Sale',
      slug: 'spring-fine-art-sale',
      type: 'timed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid slug format', () => {
    const result = auctionSchema.safeParse({
      title: 'Test Auction',
      slug: 'Invalid Slug!',
      type: 'timed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid auction type', () => {
    const result = auctionSchema.safeParse({
      title: 'Test',
      slug: 'test',
      type: 'hybrid',
    });
    expect(result.success).toBe(false);
  });

  it('validates with buyer premium', () => {
    const result = auctionSchema.safeParse({
      title: 'Test',
      slug: 'test',
      type: 'live',
      buyerPremiumPercent: 25,
    });
    expect(result.success).toBe(true);
  });

  it('rejects buyer premium over 50%', () => {
    const result = auctionSchema.safeParse({
      title: 'Test',
      slug: 'test',
      type: 'timed',
      buyerPremiumPercent: 60,
    });
    expect(result.success).toBe(false);
  });
});

describe('consignmentSchema', () => {
  it('validates a valid consignment', () => {
    const result = consignmentSchema.safeParse({
      title: 'Antique Vase',
      categorySlug: 'antiques',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = consignmentSchema.safeParse({
      title: '',
      categorySlug: 'antiques',
    });
    expect(result.success).toBe(false);
  });
});
