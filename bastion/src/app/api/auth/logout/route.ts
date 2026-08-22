import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (session) {
    await logAudit({ orgId: session.orgId, userId: session.userId, email: session.email, action: 'LOGOUT', req });
  }
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
