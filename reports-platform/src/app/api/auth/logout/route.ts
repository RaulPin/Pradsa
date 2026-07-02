import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (session) {
    await logAudit({ userId: session.userId, email: session.email, action: 'LOGOUT', req });
  }
  clearSessionCookie();
  // 303 fuerza al navegador a hacer GET en /login (evita el 405 por reenvío del POST).
  return NextResponse.redirect(new URL('/login', req.url), 303);
}
