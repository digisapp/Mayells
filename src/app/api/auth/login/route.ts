import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validation/schemas';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Fetch user role to determine redirect
    let role = 'buyer';
    try {
      const [profile] = await db.select({ role: users.role }).from(users).where(eq(users.id, data.user.id)).limit(1);
      if (profile?.role) role = profile.role;
    } catch {
      // DB lookup failed — default to buyer, login still succeeds
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      session: data.session,
      role,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
