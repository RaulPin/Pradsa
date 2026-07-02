import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServiceClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import type { Role } from '@/types';

function landingFor(role: Role): string {
  if (role === 'UPLOADER') return '/upload';
  if (role === 'CLIENT_FOLDER' || role === 'CLIENT_BANCA') return '/folders';
  return '/dashboard';
}

function strongEnough(pw: string): boolean {
  return (
    pw.length >= 10 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { password } = await req.json().catch(() => ({}));
  if (!password || !strongEnough(password)) {
    return NextResponse.json({ error: 'La contraseña no cumple los requisitos de seguridad' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const hash = await bcrypt.hash(password, 12);
  await supabase
    .from('profiles')
    .update({ password_hash: hash, must_change_password: false, updated_at: new Date().toISOString() })
    .eq('id', session.userId);

  await logAudit({ userId: session.userId, email: session.email, action: 'PASSWORD_CHANGED', req });

  return NextResponse.json({ ok: true, redirect: landingFor(session.role) });
}
