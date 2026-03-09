import { generateObject } from 'ai';
import { z } from 'zod';
import { getVisionModel } from './client';

const authenticationSchema = z.object({
  verdict: z.enum(['likely_authentic', 'uncertain', 'likely_inauthentic']).describe('Overall authenticity assessment'),
  confidenceScore: z.number().min(0).max(1).describe('Confidence in the verdict (0-1)'),
  summary: z.string().describe('1-2 sentence summary of the assessment'),
  analysis: z.object({
    styleConsistency: z.object({
      score: z.number().min(0).max(10).describe('How consistent is the style with the attributed artist/period (0-10)'),
      notes: z.string().describe('Specific observations about style'),
    }),
    materialsAndTechnique: z.object({
      score: z.number().min(0).max(10).describe('How consistent are the materials and technique (0-10)'),
      notes: z.string().describe('Observations about materials, brushwork, construction, etc.'),
    }),
    ageIndicators: z.object({
      score: z.number().min(0).max(10).describe('How consistent are age indicators (0-10)'),
      notes: z.string().describe('Observations about patina, wear, aging patterns'),
    }),
    provenance: z.object({
      score: z.number().min(0).max(10).describe('Strength of provenance (0-10)'),
      notes: z.string().describe('Assessment of ownership history'),
    }),
  }),
  redFlags: z.array(z.string()).describe('Any concerning indicators'),
  recommendations: z.array(z.string()).describe('Recommended next steps (e.g., physical inspection, UV analysis, material testing)'),
});

export type AuthenticationResult = z.infer<typeof authenticationSchema>;

/**
 * AI-powered preliminary authenticity analysis of a lot.
 * This is a screening tool, NOT a replacement for expert physical examination.
 */
export async function authenticateLot(params: {
  imageUrls: string[];
  title?: string;
  artist?: string;
  period?: string;
  medium?: string;
  provenance?: string;
  estimatedValue?: number;
}): Promise<AuthenticationResult> {
  const imageContent = params.imageUrls.map((url) => ({
    type: 'image' as const,
    image: new URL(url),
  }));

  const metadata = [
    params.title && `Title: ${params.title}`,
    params.artist && `Attributed to: ${params.artist}`,
    params.period && `Period: ${params.period}`,
    params.medium && `Medium: ${params.medium}`,
    params.provenance && `Provenance: ${params.provenance}`,
    params.estimatedValue && `Estimated value: $${(params.estimatedValue / 100).toLocaleString()}`,
  ].filter(Boolean).join('\n');

  const { object } = await generateObject({
    model: getVisionModel(),
    schema: authenticationSchema,
    messages: [
      {
        role: 'system',
        content: `You are an art authentication specialist working for Mayell auction house. Perform a preliminary visual authenticity screening based on the provided images.

IMPORTANT DISCLAIMERS:
- This is an AI-assisted preliminary screening, NOT a definitive authentication
- Physical examination by qualified experts is always required for high-value items
- Visual analysis from photographs has inherent limitations

Evaluate:
1. **Style Consistency**: Does the style match the attributed artist/maker/period?
2. **Materials & Technique**: Do visible materials and techniques look period-appropriate?
3. **Age Indicators**: Do patina, wear patterns, and aging look natural and consistent?
4. **Provenance**: How strong is the documented ownership history?

Score each area 0-10 and flag any red flags. Always recommend appropriate next steps.

Be conservative — when in doubt, lean toward "uncertain" rather than "likely_authentic".`,
      },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text' as const, text: metadata ? `Please perform an authenticity screening.\n\nLot information:\n${metadata}` : 'Please perform an authenticity screening on this lot.' },
        ],
      },
    ],
  });

  return object;
}
