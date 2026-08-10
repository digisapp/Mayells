import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { redis, isRedisConfigured } from '@/lib/redis';

const adminAuthRoutes = ['/admin/login'];

type CachedProfile = { role: string | null; is_admin: boolean | null };

// Role changes are rare; a short TTL keeps every admin page load from paying
// a Supabase REST round trip. Trade-off: revoking admin can take up to this
// long to bite in the middleware (API routes still check the DB directly).
const PROFILE_CACHE_SECONDS = 300;

async function getUserProfile(userId: string): Promise<CachedProfile | null> {
  const cacheKey = `mw:profile:${userId}`;

  if (isRedisConfigured) {
    try {
      const cached = await redis.get<CachedProfile>(cacheKey);
      if (cached) return cached;
    } catch {
      // Redis down — fall through to the direct lookup
    }
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: profile } = await adminClient
    .from('users')
    .select('role, is_admin')
    .eq('id', userId)
    .single();

  if (profile && isRedisConfigured) {
    try {
      await redis.set(cacheKey, profile, { ex: PROFILE_CACHE_SECONDS });
    } catch {
      // cache write is best-effort
    }
  }
  return profile;
}

// Single source of truth shared with every API route (src/lib/auth/admin.ts):
// admin === role 'admin' OR is_admin true.
const isAdminUser = isAdminProfile;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isAdminScope = pathname.startsWith('/admin');

  // Fast path: anonymous visitor on a public page. No session to refresh and
  // no role to check — skip creating the Supabase client entirely.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (!hasAuthCookie && !isAdminScope) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Public pages: middleware's only job is keeping the session fresh (RSC
  // pages can't write refreshed auth cookies). getClaims() verifies the JWT
  // locally and refreshes when expired — unlike getUser(), it doesn't pay a
  // Supabase Auth REST round trip on every signed-in navigation.
  if (!isAdminScope) {
    try {
      await supabase.auth.getClaims();
    } catch {
      // Best-effort refresh; per-route handlers still authenticate strictly.
    }
    return response;
  }

  // Admin scope: strict server-side validation.
  const { data: { user } } = await supabase.auth.getUser();

  // Handle /admin/login — if already logged in as admin, go to /admin
  if (adminAuthRoutes.some((route) => pathname.startsWith(route))) {
    if (user) {
      const profile = await getUserProfile(user.id);
      if (isAdminUser(profile)) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
    }
    return response;
  }

  // Admin routes: require auth + admin role
  if (!user) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  const profile = await getUserProfile(user.id);
  if (!isAdminUser(profile)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return response;
}

export const config = {
  // Exclude API routes, Next.js internals, and static assets — middleware only guards page routes
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
