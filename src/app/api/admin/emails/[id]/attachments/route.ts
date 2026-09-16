import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { emails } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getResend } from '@/lib/email/resend';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { logger } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/emails/[id]/attachments — fresh signed download URLs for an
 * inbound email's attachments. Files live on Resend and their URLs expire, so
 * the UI fetches this on demand instead of storing URLs.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid email id' }, { status: 400 });
    }

    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (email.direction !== 'inbound' || !email.resendId) {
      return NextResponse.json({ data: [] });
    }

    const resend = getResend();
    const { data: list, error } = await resend.emails.receiving.attachments.list({
      emailId: email.resendId,
    });
    if (error) {
      logger.error('Failed to list inbound attachments', error, { emailId: id });
      return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 502 });
    }

    return NextResponse.json({
      data: (list?.data ?? []).map((a) => ({
        id: a.id,
        filename: a.filename || 'attachment',
        size: a.size,
        contentType: a.content_type,
        downloadUrl: a.download_url,
        expiresAt: a.expires_at,
      })),
    });
  } catch (error) {
    logger.error('Admin email attachments error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
