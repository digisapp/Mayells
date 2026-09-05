import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { redis, isRedisConfigured } from '@/lib/redis';
import { profileCacheKey } from '@/lib/auth/profile-cache';
import { logger } from '@/lib/logger';

/**
 * Called after a TOTP factor is verified or removed so the middleware's
 * cached "MFA enrolled" flag is dropped and enforcement follows immediately.
 * The factor itself is managed client-side through Supabase Auth.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (isRedisConfigured) {
      try {
        await redis.del(profileCacheKey(user.id));
      } catch (err) {
        logger.error('Failed to drop middleware profile cache', err, { userId: user.id });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('MFA refresh error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
