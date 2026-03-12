import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Documents feature — returns empty for now until agreements table is built out
    return NextResponse.json({ data: [] });
  } catch (error) {
    console.error('Documents error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
