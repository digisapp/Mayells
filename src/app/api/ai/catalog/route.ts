import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { catalogLotFromImages } from '@/lib/ai/cataloging';
import { logger } from '@/lib/logger';

const bodySchema = z.object({
  imageUrls: z
    .array(z.string().url('Each image must be a valid URL').max(2000))
    .min(1, 'At least one image URL is required')
    .max(10, 'At most 10 images per request'),
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

    const result = await catalogLotFromImages(parsed.data.imageUrls);

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error('AI catalog error', error);
    return NextResponse.json({ error: 'AI cataloging failed' }, { status: 500 });
  }
}
