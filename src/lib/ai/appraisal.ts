import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './client';

const appraisalSchema = z.object({
  estimateLow: z.number().int().positive().describe('Low estimate in USD cents'),
  estimateHigh: z.number().int().positive().describe('High estimate in USD cents'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().describe('2-3 paragraph explanation of the valuation methodology, comparable sales, and market context'),
  comparables: z.array(z.object({
    description: z.string().describe('Brief description of comparable sale'),
    salePrice: z.number().int().describe('Sale price in USD cents'),
    auctionHouse: z.string().optional(),
    saleDate: z.string().optional(),
  })).describe('2-5 comparable recent auction results'),
  marketTrend: z.enum(['rising', 'stable', 'declining']).describe('Current market trend for this category'),
  recommendedReserve: z.number().int().positive().describe('Recommended reserve price in USD cents (typically 60-80% of low estimate)'),
  suggestedStartingBid: z.number().int().positive().describe('Recommended opening bid in USD cents'),
});

export type AppraisalResult = z.infer<typeof appraisalSchema>;

/**
 * Generate an AI-powered appraisal for a lot based on images and metadata.
 */
export async function appraiseLot(params: {
  imageUrls: string[];
  title?: string;
  description?: string;
  artist?: string;
  medium?: string;
  period?: string;
  dimensions?: string;
  condition?: string;
  provenance?: string;
}): Promise<AppraisalResult> {
  const imageContent = params.imageUrls.map((url) => ({
    type: 'image' as const,
    image: new URL(url),
  }));

  const metadata = [
    params.title && `Title: ${params.title}`,
    params.artist && `Artist: ${params.artist}`,
    params.medium && `Medium: ${params.medium}`,
    params.period && `Period: ${params.period}`,
    params.dimensions && `Dimensions: ${params.dimensions}`,
    params.condition && `Condition: ${params.condition}`,
    params.provenance && `Provenance: ${params.provenance}`,
    params.description && `Description: ${params.description}`,
  ].filter(Boolean).join('\n');

  const { object } = await generateObject({
    model: getModel('vision'),
    schema: appraisalSchema,
    messages: [
      {
        role: 'system',
        content: `You are a senior appraiser for Mayell, an AI-powered luxury auction house. You have deep expertise in Art, Antiques, Luxury goods, Fashion, Jewelry, and Design.

Provide a professional appraisal including:
- Low and high estimates based on current market conditions and recent comparable sales
- A confidence score reflecting how certain you are (lower if limited information)
- Referenced comparable sales (even if approximate)
- Market trend assessment
- Recommended reserve and starting bid

All monetary values should be in USD cents (e.g., $5,000 = 500000).

Be realistic and conservative — it's better to underestimate and exceed expectations than to overestimate. Factor in condition, rarity, provenance, artist/maker desirability, and current market demand.`,
      },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text' as const, text: metadata ? `Please appraise this lot.\n\nKnown information:\n${metadata}` : 'Please appraise this auction lot based on the images.' },
        ],
      },
    ],
  });

  return object;
}
