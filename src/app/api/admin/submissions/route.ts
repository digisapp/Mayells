import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const BUCKET = 'lot-images';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: files, error } = await admin.storage
      .from(BUCKET)
      .list('submissions', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      logger.error('List submissions error', error);
      return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
    }

    const images = (files || [])
      .filter((f) => !f.name.startsWith('.'))
      .map((f) => {
        const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(`submissions/${f.name}`);
        return {
          name: f.name,
          url: publicUrl,
          createdAt: f.created_at,
          size: f.metadata?.size,
        };
      });

    return NextResponse.json({ data: images });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
