import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign-in and sign-up have nothing to offer someone already signed in, so
 * send them on to where they were headed.
 *
 * getUser(), not getClaims(): the account pages that send people here check
 * with getUser(), and a session revoked elsewhere (signing out ends every
 * session) still verifies locally until its token expires. Judged
 * differently, the two would bounce the visitor between them forever.
 */
export async function redirectIfSignedIn(next: string): Promise<void> {
  const cookieStore = await cookies();
  if (!cookieStore.getAll().some((c) => c.name.startsWith('sb-'))) return;

  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  } catch {
    // Can't tell: show the form.
  }
  // Outside the try: redirect() works by throwing.
  if (signedIn) redirect(next);
}
