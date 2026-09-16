import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { appraiseLot } from '@/lib/ai/appraisal';
import { logger } from '@/lib/logger';

const bodySchema = z.object({
  imageUrls: z
    .array(z.string().url('Each image must be a valid URL').max(2000))
    .min(1, 'At least one image URL is required')
    .max(10, 'At most 10 images per request'),
  title: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  artist: z.string().max(300).optional(),
  medium: z.string().max(300).optional(),
  period: z.string().max(200).optional(),
  dimensions: z.string().max(300).optional(),
  condition: z.string().max(200).optional(),
  provenance: z.string().max(5000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'imageUrls array required' },
        { status: 400 },
      );
    }

    const result = await appraiseLot(parsed.data);

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error('AI appraise error', error);
    return NextResponse.json({ error: 'AI appraisal failed' }, { status: 500 });
  }
}
