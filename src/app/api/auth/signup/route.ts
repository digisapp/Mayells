import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { users } from '@/db/schema';
import { signupSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password, fullName } = parsed.data;
    const supabase = createAdminClient();

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create user profile in our database — always default to buyer
    await db.insert(users).values({
      id: authData.user.id,
      email,
      fullName,
      role: 'buyer',
    });

    return NextResponse.json({ success: true, userId: authData.user.id });
  } catch (error) {
    logger.error('Signup error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
