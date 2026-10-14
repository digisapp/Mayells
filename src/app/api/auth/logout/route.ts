import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { rejectCrossSiteAuthRequest } from '@/lib/auth/same-origin';

export async function POST(req: NextRequest) {
  try {
    // No body to type-check; refusing other sites is enough.
    const rejected = rejectCrossSiteAuthRequest(req, { json: false });
    if (rejected) return rejected;

    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Logout error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
