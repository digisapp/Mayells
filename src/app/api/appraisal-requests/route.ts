import { NextRequest, NextResponse } from 'next/server';
import { sendAppraisalRequestNotification } from '@/lib/email/notifications';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB per file
const BUCKET = 'lot-images';

export async function POST(req: NextRequest) {
  try {
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
              console.error('Photo upload error:', error);
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

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    sendAppraisalRequestNotification(
      { name, phone, email, service, items, message },
      photoUrls,
    ).catch((err) =>
      console.error('Failed to send appraisal notification:', err),
    );

    return NextResponse.json(
      { data: { message: 'Request submitted successfully' } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
