import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

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
  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    const profile = await getUserProfile(user.id);
    if (!isAdminUser(profile)) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    return response;
  }

  return response;
}

export const config = {
  // Exclude API routes, Next.js internals, and static assets — middleware only guards page routes
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
