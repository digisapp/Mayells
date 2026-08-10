import { NextRequest, NextResponse } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { emails, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/emails/[id] — the full email row (bodies, AI draft,
 * attachment metadata). The inbox list endpoint returns slim header rows, so
 * the UI fetches this on demand when a row is expanded.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const [profile] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!profile || !isAdminProfile(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid email id' }, { status: 400 });
    }

    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: email });
  } catch (error) {
    logger.error('Admin email fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
