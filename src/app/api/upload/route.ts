import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const BUCKET = 'lot-images';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check user is admin or seller
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || (profile.role !== 'admin' && profile.role !== 'seller')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, WebP, or AVIF.' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Max 10MB.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(BUCKET)
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      logger.error('Upload error', error);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage
      .from(BUCKET)
      .getPublicUrl(data.path);

    return NextResponse.json({ url: publicUrl, path: data.path });
  } catch (error) {
    logger.error('Upload error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
