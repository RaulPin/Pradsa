import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServiceClient } from '@/lib/supabase/server';
import { generateOtp, hashOtp } from '@/lib/auth';
import { sendOtpEmail } from '@/lib/email';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: 'Correo y contraseña requeridos' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', String(email).toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  // Respuesta genérica para no revelar si el correo existe.
  const genericError = NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });

  if (!profile) {
    await logAudit({ email, action: 'LOGIN_FAILED', metadata: { reason: 'no_user' }, req });
    return genericError;
  }

  const ok = await bcrypt.compare(password, profile.password_hash);
  if (!ok) {
    await logAudit({ userId: profile.id, email, action: 'LOGIN_FAILED', metadata: { reason: 'bad_password' }, req });
    return genericError;
  }

  // Generar y guardar OTP (5 min)
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await supabase.from('otp_codes').insert({
    user_id: profile.id,
    email: profile.email,
    code_hash: hashOtp(code),
    expires_at: expiresAt,
  });

  await sendOtpEmail(profile.email, code);
  await logAudit({ userId: profile.id, email: profile.email, action: 'OTP_REQUESTED', req });

  return NextResponse.json({ ok: true });
}
