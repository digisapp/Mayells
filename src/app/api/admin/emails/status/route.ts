import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { getInboxStatus } from '@/lib/email/inbox-status';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** GET /api/admin/emails/status[?fresh=1] — can this inbox receive mail right now? */
export async function GET(req: NextRequest) {
  try {
    const { admin, response } = await requireAdminApi();
    if (!admin) return response;

    const fresh = req.nextUrl.searchParams.get('fresh') === '1';
    const status = await getInboxStatus({ fresh });
    return NextResponse.json(status, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('Inbox status error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
