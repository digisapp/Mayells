import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resetPasswordSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

/**
 * Set a new password for the currently authenticated user. Reached from the
 * recovery-link flow: the emailed link runs through /api/auth/callback, which
 * exchanges the one-time code for a session, so by the time the user submits
 * this form they are signed in. No extra token is needed — possession of the
 * session IS the proof they clicked the emailed link.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Your reset link has expired. Please request a new one.' },
        { status: 401 },
      );
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Same role-aware redirect contract as /api/auth/login, so the client
    // can send admins to /admin instead of the homepage.
    let role = 'buyer';
    try {
      const [profile] = await db
        .select({ role: users.role, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (profile?.isAdmin) {
        role = 'admin';
      } else if (profile?.role) {
        role = profile.role;
      }
    } catch {
      // lookup failed — default to buyer, reset still succeeds
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    logger.error('Reset password error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
