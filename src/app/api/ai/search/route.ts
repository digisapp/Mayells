import { NextRequest, NextResponse } from 'next/server';
import { aiSearch } from '@/lib/ai/search';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success } = await rateLimit(`ai:search:${ip}`, { maxRequests: 60, windowSeconds: 3600 });
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429, headers: { 'Retry-After': '3600' } });
    }

    const query = request.nextUrl.searchParams.get('q');
    if (!query || query.trim().length < 2 || query.length > 500) {
      return NextResponse.json({ error: 'Query parameter "q" required (min 2, max 500 chars)' }, { status: 400 });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '24', 10);
    const { results, intent } = await aiSearch(query.trim(), Math.min(limit, 48));

    return NextResponse.json({ data: results, intent });
  } catch (error) {
    logger.error('AI search error', error);
    return NextResponse.json({ error: 'AI search failed' }, { status: 500 });
  }
}
