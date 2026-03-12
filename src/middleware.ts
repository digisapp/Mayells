import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const protectedRoutes = ['/dashboard', '/bids', '/won', '/watchlist', '/invoices', '/settings', '/payouts'];
const adminRoutes = ['/admin'];
const authRoutes = ['/login', '/signup', '/reset-password'];
const adminAuthRoutes = ['/admin/login'];

async function getUserProfile(userId: string) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: profile } = await adminClient
    .from('users')
    .select('role, is_admin')
    .eq('id', userId)
    .single();
  return profile;
}

function isAdminUser(profile: { role: string; is_admin: boolean } | null): boolean {
  return profile?.role === 'admin' || profile?.is_admin === true;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

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

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Handle /admin/login separately — if already logged in as admin, go to /admin
  if (adminAuthRoutes.some((route) => pathname.startsWith(route))) {
    if (user) {
      const profile = await getUserProfile(user.id);
      if (isAdminUser(profile)) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      // Non-admin trying to access admin login — send to client dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    // Not logged in — allow access to admin login page
    return response;
  }

  // Redirect authenticated users away from client auth pages
  if (user && authRoutes.some((route) => pathname.startsWith(route))) {
    const profile = await getUserProfile(user.id);
    const dest = isAdminUser(profile) ? '/admin' : '/dashboard';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Admin routes: require auth + admin role (check before protected routes since /admin also starts with /admin)
  if (adminRoutes.some((route) => pathname.startsWith(route))) {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    const profile = await getUserProfile(user.id);
    if (!isAdminUser(profile)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // Redirect unauthenticated users to login
  if (!user && protectedRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL(`/login?next=${pathname}`, request.url));
  }

  // If an admin user tries to access /dashboard, redirect them to /admin
  if (user && pathname.startsWith('/dashboard')) {
    const profile = await getUserProfile(user.id);
    if (isAdminUser(profile)) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
