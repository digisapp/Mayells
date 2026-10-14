import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { isAdminProfile } from '@/lib/auth/admin';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only what the header and bid form need. The full row carries staff-only
    // notes, the consignor portal key and Stripe ids, none of which belong in
    // the customer's browser.
    const [profile] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        displayName: users.displayName,
        role: users.role,
        isAdmin: users.isAdmin,
        accountStatus: users.accountStatus,
      })
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        displayName: profile.displayName,
        role: profile.role,
        // The full admin predicate, so a suspended admin isn't shown admin links.
        isAdmin: isAdminProfile(profile),
      },
    });
  } catch (error) {
    logger.error('Get profile error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
