import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge, canAccess, SESSION_COOKIE } from '@/lib/auth-edge';

const PUBLIC_PATHS = ['/login', '/verify-otp'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifyTokenEdge(req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (session && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(session ? '/dashboard' : '/login', req.url));
  }

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!canAccess(session.role, pathname)) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
