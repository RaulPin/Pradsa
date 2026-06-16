import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashOtp, createToken, setSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import type { Role } from '@/types';

const MAX_ATTEMPTS = 5;

function landingFor(role: Role): string {
  if (role === 'UPLOADER') return '/upload';
  if (role === 'CLIENT_FOLDER') return '/folders';
  return '/dashboard';
}

export async function POST(req: NextRequest) {
  const { email, code } = await req.json().catch(() => ({}));
  if (!email || !code) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: otp } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', String(email).toLowerCase())
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp) {
    return NextResponse.json({ error: 'Código inválido o expirado' }, { status: 401 });
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Demasiados intentos. Solicita un nuevo código.' }, { status: 429 });
  }
  if (new Date(otp.expires_at) < new Date()) {
    return NextResponse.json({ error: 'El código ha expirado' }, { status: 401 });
  }
  if (otp.code_hash !== hashOtp(String(code))) {
    await supabase.from('otp_codes').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
    return NextResponse.json({ error: 'Código incorrecto' }, { status: 401 });
  }

  await supabase.from('otp_codes').update({ used: true }).eq('id', otp.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', otp.user_id)
    .single();

  const token = createToken({ userId: profile.id, email: profile.email, role: profile.role });
  setSessionCookie(token);

  await logAudit({ userId: profile.id, email: profile.email, action: 'OTP_VERIFIED', req });
  await logAudit({ userId: profile.id, email: profile.email, action: 'LOGIN', req });

  return NextResponse.json({
    ok: true,
    mustChangePassword: profile.must_change_password,
    redirect: landingFor(profile.role),
  });
}
