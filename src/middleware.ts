import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { isAdminProfile } from '@/lib/auth/admin';
import { redis, isRedisConfigured } from '@/lib/redis';
import { hasVerifiedTotpFactor, needsMfaChallenge, isMfaExemptPath, MFA_CHALLENGE_PATH } from '@/lib/auth/mfa';
import { profileCacheKey, PROFILE_CACHE_SECONDS } from '@/lib/auth/profile-cache';
import { getMicrositeByHost } from '@/lib/microsites/config';

const adminAuthRoutes = ['/admin/login'];

// `mfa`: the account has a verified TOTP factor. Cached alongside the role so
// enforcing two-factor on API calls costs one Redis GET, not an Auth round
// trip; enroll/unenroll drop the key via /api/auth/mfa/refresh.
type CachedProfile = { role: string | null; is_admin: boolean | null; mfa?: boolean };

// Role changes are rare; a short TTL keeps every admin page load from paying
// a Supabase REST round trip. Trade-off: revoking admin can take up to this
// long to bite in the middleware (API routes still check the DB directly).
async function getUserProfile(userId: string): Promise<CachedProfile | null> {
  const cacheKey = profileCacheKey(userId);

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
  const [{ data: row }, factorsResult] = await Promise.all([
    adminClient.from('users').select('role, is_admin').eq('id', userId).single(),
    adminClient.auth.admin.mfa.listFactors({ userId }).catch(() => null),
  ]);
  if (!row) return null;

  const profile: CachedProfile = {
    role: row.role,
    is_admin: row.is_admin,
    mfa: hasVerifiedTotpFactor(factorsResult?.data?.factors),
  };

  if (isRedisConfigured) {
    try {
      await redis.set(cacheKey, profile, { ex: PROFILE_CACHE_SECONDS });
    } catch {
      // cache write is best-effort
    }
  }
  return profile;
}

/** Current authenticator assurance level from the locally-verified JWT. */
async function currentAal(supabase: ReturnType<typeof createServerClient>): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getClaims();
    return (data?.claims as { aal?: string } | undefined)?.aal;
  } catch {
    return undefined;
  }
}

// Single source of truth shared with every API route (src/lib/auth/admin.ts):
// admin === role 'admin' OR is_admin true.
const isAdminUser = isAdminProfile;

const MAIN_HOST = 'https://mayells.com';

/**
 * City microsites (delraybeachauctions.com and friends) are served by this
 * same deployment, selected on the Host header. Each domain exposes exactly
 * one page plus its own robots/sitemap; every other path 301s to the
 * equivalent on mayells.com.
 *
 * Deliberately a single landing page per domain rather than a full mirror of
 * the catalogue: duplicating lot and auction pages across five hosts would
 * split ranking signals between them and is precisely the pattern Google
 * classifies as doorway pages. Depth stays on the main domain.
 */
function handleMicrosite(request: NextRequest): NextResponse | null {
  const site = getMicrositeByHost(request.headers.get('host'));
  if (!site) return null;

  const { pathname, search } = request.nextUrl;

  // API calls (the consignment form) and framework assets must reach their
  // real handlers untouched, on the same origin — the CSP sets
  // form-action/connect-src to 'self', so they cannot be sent to mayells.com.
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) return null;

  if (pathname === '/') {
    return NextResponse.rewrite(new URL(`/sites/${site.slug}`, request.url));
  }
  if (pathname === '/robots.txt') {
    return NextResponse.rewrite(new URL(`/sites/${site.slug}/robots.txt`, request.url));
  }
  // Served from `city-sitemap` rather than a `sitemap.xml` segment: Next
  // reserves that name for its own metadata convention, which forces a
  // generateSitemaps() placeholder route instead of one file per city.
  if (pathname === '/sitemap.xml') {
    return NextResponse.rewrite(new URL(`/sites/${site.slug}/city-sitemap`, request.url));
  }

  // The share card is the page's file-based metadata route, so Next emits its
  // URL under the page's own segment. Let exactly that path through — the
  // /sites/ guard below is for the main host, where the rewrite never runs.
  if (pathname === `/sites/${site.slug}/opengraph-image`) {
    return NextResponse.next();
  }

  // Anything else belongs to the main brand. Permanent, so the link equity
  // consolidates there instead of accumulating on the city domain.
  return NextResponse.redirect(new URL(`${pathname}${search}`, MAIN_HOST), 308);
}

export async function middleware(request: NextRequest) {
  const micrositeResponse = handleMicrosite(request);
  if (micrositeResponse) return micrositeResponse;

  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // /sites/* exists only to be rewritten onto a city domain. Served on the
  // main host it would be a second, indexable copy of each microsite.
  if (pathname.startsWith('/sites/')) {
    return new NextResponse(null, { status: 404 });
  }
  const isAdminScope = pathname.startsWith('/admin');
  const isApi = pathname.startsWith('/api/');

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

  // API routes with a session: enforce two-factor for accounts that enrolled
  // one. The JWT carries the session's assurance level (verified locally, no
  // network); only an aal1 session pays the cached profile lookup. Auth
  // endpoints stay open so the challenge can be completed or abandoned.
  if (isApi) {
    if (isMfaExemptPath(pathname)) return response;
    try {
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims as { sub?: string; aal?: string } | undefined;
      if (claims?.sub && claims.aal !== 'aal2') {
        const profile = await getUserProfile(claims.sub);
        if (needsMfaChallenge({ mfaEnrolled: profile?.mfa === true, aal: claims.aal })) {
          return NextResponse.json(
            { error: 'Two-factor verification required', code: 'MFA_REQUIRED' },
            { status: 401 },
          );
        }
      }
    } catch {
      // Best-effort; per-route handlers still authenticate strictly.
    }
    return response;
  }

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
  const isChallengePage = pathname === MFA_CHALLENGE_PATH;

  // Handle /admin/login and the MFA challenge page.
  if (adminAuthRoutes.some((route) => pathname.startsWith(route))) {
    if (!user) {
      return isChallengePage ? NextResponse.redirect(new URL('/admin/login', request.url)) : response;
    }
    const profile = await getUserProfile(user.id);
    if (!isAdminUser(profile)) {
      return isChallengePage ? NextResponse.redirect(new URL('/admin/login', request.url)) : response;
    }
    const mustChallenge = needsMfaChallenge({
      mfaEnrolled: hasVerifiedTotpFactor(user.factors) || profile?.mfa === true,
      aal: await currentAal(supabase),
    });
    if (mustChallenge) {
      return isChallengePage ? response : NextResponse.redirect(new URL(MFA_CHALLENGE_PATH, request.url));
    }
    // Fully signed in — nothing to do on the auth pages.
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  // Admin routes: require auth + admin role
  if (!user) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  const profile = await getUserProfile(user.id);
  if (!isAdminUser(profile)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Accounts that enrolled a TOTP factor must present the code once per
  // session before any admin page renders. `user.factors` comes fresh from
  // Auth on every admin navigation; the cached flag is the fallback.
  const mustChallenge = needsMfaChallenge({
    mfaEnrolled: hasVerifiedTotpFactor(user.factors) || profile?.mfa === true,
    aal: await currentAal(supabase),
  });
  if (mustChallenge) {
    const challenge = new URL(MFA_CHALLENGE_PATH, request.url);
    challenge.searchParams.set('next', pathname);
    return NextResponse.redirect(challenge);
  }
  return response;
}

export const config = {
  // Guard page routes AND API routes (the latter only for two-factor
  // enforcement on signed-in sessions — anonymous API calls, webhooks and
  // crons take the cookie-less fast path above). Skip Next.js internals and
  // static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
