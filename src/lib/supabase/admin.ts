import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';

export function createAdminClient() {
  return createClient(
    supabaseUrl()!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
