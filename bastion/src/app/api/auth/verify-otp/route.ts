import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashOtp, createToken, setSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const MAX_ATTEMPTS = 5;

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

  if (!otp) return NextResponse.json({ error: 'Código inválido o expirado' }, { status: 401 });
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

  const { data: user } = await supabase.from('users').select('*').eq('id', otp.user_id).single();

  // Organización activa = primera membresía del usuario.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('role, organizations!inner(id, slug, is_active)')
    .eq('user_id', user.id);

  const active = (memberships || []).find((m: any) => m.organizations?.is_active);
  if (!active) {
    return NextResponse.json({ error: 'Tu cuenta no está asociada a ninguna organización activa.' }, { status: 403 });
  }

  const org = active.organizations as any;
  const token = createToken({
    userId: user.id,
    email: user.email,
    orgId: org.id,
    orgSlug: org.slug,
    role: active.role,
  });
  setSessionCookie(token);

  await logAudit({ orgId: org.id, userId: user.id, email: user.email, action: 'OTP_VERIFIED', req });
  await logAudit({ orgId: org.id, userId: user.id, email: user.email, action: 'LOGIN', req });

  return NextResponse.json({ ok: true, redirect: '/dashboard' });
}
