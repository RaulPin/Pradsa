import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge, canAccess, landingFor, SESSION_COOKIE } from '@/lib/auth-edge';

const PUBLIC_PATHS = ['/login', '/verify-otp', '/change-password'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifyTokenEdge(req.cookies.get(SESSION_COOKIE)?.value);

  // Rutas públicas de auth: si ya hay sesión, mandar al inicio adecuado.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (session && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL(landingFor(session.role), req.url));
    }
    return NextResponse.next();
  }

  // Raíz -> redirige según sesión
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(session ? landingFor(session.role) : '/login', req.url)
    );
  }

  // Rutas protegidas
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!canAccess(session.role, pathname)) {
    return NextResponse.redirect(new URL(landingFor(session.role), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
