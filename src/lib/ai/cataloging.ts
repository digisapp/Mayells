import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './client';

const catalogSchema = z.object({
  title: z.string().describe('Concise auction lot title (5-15 words)'),
  subtitle: z.string().optional().describe('Optional subtitle with additional detail'),
  description: z.string().describe('Detailed 2-4 paragraph auction catalog description. Professional tone, covering visual appearance, craftsmanship, historical context, and significance.'),
  artist: z.string().optional().describe('Artist or maker name if identifiable'),
  maker: z.string().optional().describe('Manufacturer, workshop, or studio'),
  period: z.string().optional().describe('Art historical period (e.g., Art Deco, Victorian, Mid-Century Modern)'),
  circa: z.string().optional().describe('Approximate date or date range (e.g., "c. 1920", "1850-1870")'),
  origin: z.string().optional().describe('Country or region of origin'),
  medium: z.string().optional().describe('Materials and techniques (e.g., "Oil on canvas", "Sterling silver")'),
  dimensions: z.string().optional().describe('Estimated dimensions if determinable'),
  condition: z.enum(['mint', 'excellent', 'very_good', 'good', 'fair', 'poor', 'as_is']).describe('Estimated condition grade'),
  conditionNotes: z.string().optional().describe('Brief condition notes visible in the image'),
  suggestedCategory: z.enum(['art', 'antiques', 'luxury', 'fashion', 'jewelry', 'design']).describe('Best-fit category'),
  tags: z.array(z.string()).describe('5-10 descriptive tags for search and discovery'),
});

export type CatalogResult = z.infer<typeof catalogSchema>;

/**
 * Analyze lot images and generate a complete catalog entry.
 * Accepts one or more image URLs.
 */
export async function catalogLotFromImages(imageUrls: string[]): Promise<CatalogResult> {
  const imageContent = imageUrls.map((url) => ({
    type: 'image' as const,
    image: new URL(url),
  }));

  const { object } = await generateObject({
    model: getModel('vision'),
    schema: catalogSchema,
    messages: [
      {
        role: 'system',
        content: `You are an expert auction cataloger for Mayell, a luxury auction house specializing in Art, Antiques, Luxury, Fashion, Jewelry, and Design.

Analyze the provided images and generate a complete, professional catalog entry. Write in the authoritative yet accessible tone of major auction houses like Phillips, Christie's, or Sotheby's.

Key guidelines:
- Be specific about materials, techniques, and periods
- Note visible condition issues honestly
- Use proper art historical terminology
- If you can identify the artist/maker, include them; if uncertain, indicate "attributed to" or "in the style of"
- Tags should be useful for search (include style, era, material, color, type)`,
      },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text' as const, text: 'Please catalog this auction lot based on the images provided.' },
        ],
      },
    ],
  });

  return object;
}
