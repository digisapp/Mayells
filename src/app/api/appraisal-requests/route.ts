import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB per file
const BUCKET = 'lot-images';

const appraisalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().min(1, 'Phone is required').max(50),
  email: z.string().email('Invalid email').max(320).optional().or(z.literal('')),
  items: z.string().max(5000).optional(),
  service: z.string().max(200).optional(),
  message: z.string().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success: allowed } = await rateLimit(`appraisal:${ip}`, {
      maxRequests: 5,
      windowSeconds: 3600,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const contentType = req.headers.get('content-type') || '';

    let name: string;
    let phone: string;
    let items: string | undefined;
    let email: string | undefined;
    let service: string | undefined;
    let message: string | undefined;
    let photoUrls: string[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      name = formData.get('name') as string;
      phone = formData.get('phone') as string;
      items = (formData.get('items') as string) || undefined;
      email = (formData.get('email') as string) || undefined;
      service = (formData.get('service') as string) || undefined;
      message = (formData.get('message') as string) || undefined;

      const photos = formData.getAll('photos') as File[];
      if (photos.length > 0) {
        const admin = createAdminClient();
        const uploadPromises = photos
          .filter((p) => p.size > 0 && p.size <= MAX_FILE_SIZE)
          .map(async (photo) => {
            const ext = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
            const path = `submissions/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { data, error } = await admin.storage
              .from(BUCKET)
              .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
            if (error) {
              logger.error('Photo upload error', error);
              return null;
            }
            const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(data.path);
            return publicUrl;
          });

        const results = await Promise.all(uploadPromises);
        photoUrls = results.filter((url): url is string => url !== null);
      }
    } else {
      const body = await req.json();
      name = body.name;
      phone = body.phone;
      items = body.items;
      email = body.email;
      service = body.service;
      message = body.message;
    }

    const parsed = appraisalSchema.safeParse({ name, phone, email, items, service, message });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    ({ name, phone, email, items, service, message } = parsed.data as typeof parsed.data & { name: string; phone: string });

    sendAppraisalRequestNotification(
      { name, phone, email, service, items, message },
      photoUrls,
    ).catch((err) =>
      logger.error('Failed to send appraisal notification', err),
    );

    return NextResponse.json(
      { data: { message: 'Request submitted successfully' } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
