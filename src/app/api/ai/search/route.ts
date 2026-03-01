import { NextRequest, NextResponse } from 'next/server';
import { aiSearch } from '@/lib/ai/search';

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q');
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: 'Query parameter "q" required (min 2 chars)' }, { status: 400 });
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '24', 10);
    const { results, intent } = await aiSearch(query, Math.min(limit, 48));

    return NextResponse.json({ data: results, intent });
  } catch (error) {
    console.error('AI search error:', error);
    return NextResponse.json({ error: 'AI search failed' }, { status: 500 });
  }
}
