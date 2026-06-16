import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (session) {
    await logAudit({ userId: session.userId, email: session.email, action: 'LOGOUT', req });
  }
  clearSessionCookie();
  return NextResponse.redirect(new URL('/login', req.url));
}
