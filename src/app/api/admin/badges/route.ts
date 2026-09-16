import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/auth/require-admin';
import { getAdminBadges } from '@/lib/admin/badges';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Sidebar / topbar badge counts — see src/lib/admin/badges.ts. */
export async function GET() {
  const { admin, response } = await requireAdminApi();
  if (!admin) return response;

  try {
    const badges = await getAdminBadges();
    return NextResponse.json(badges, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('Admin badges error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
