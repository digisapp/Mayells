import { NextRequest, NextResponse } from 'next/server';
import { aiSearch } from '@/lib/ai/search';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/request-ip';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/auth/require-admin';

/** Signed-in admin? Anonymous and non-admin sessions get the public path. */
async function isAdminRequest(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return isAdminUser(user?.id);
}

export async function GET(request: NextRequest) {
  try {
    // Admins (AI Tools → Search) search every lot status and skip the per-IP
    // limit; the public behaviour below is unchanged.
    const isAdmin = await isAdminRequest();

    if (!isAdmin) {
      const ip = getClientIp(request);
      const { success } = await rateLimit(`ai:search:${ip}`, { maxRequests: 60, windowSeconds: 3600, failClosed: true });
      if (!success) {
        return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } });
      }
    }

    const query = request.nextUrl.searchParams.get('q');
    if (!query || query.trim().length < 2 || query.length > 500) {
      return NextResponse.json({ error: 'Query parameter "q" required (min 2, max 500 chars)' }, { status: 400 });
    }

    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '24', 10);
    const limit = Number.isNaN(rawLimit) ? 24 : Math.min(Math.max(rawLimit, 1), 48);
    const { results, intent } = await aiSearch(query.trim(), limit, { includeAllStatuses: isAdmin });

    // The admin response includes unpublished lots, so it must never land in
    // a shared cache keyed only by URL.
    return NextResponse.json(
      { data: results, intent },
      isAdmin ? { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } } : undefined,
    );
  } catch (error) {
    logger.error('AI search error', error);
    return NextResponse.json({ error: 'AI search failed' }, { status: 500 });
  }
}
