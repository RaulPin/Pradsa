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
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', String(email).toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  const genericError = NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });

  if (!user) {
    await logAudit({ email, action: 'LOGIN_FAILED', metadata: { reason: 'no_user' }, req });
    return genericError;
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await logAudit({ userId: user.id, email, action: 'LOGIN_FAILED', metadata: { reason: 'bad_password' }, req });
    return genericError;
  }

  const code = generateOtp();
  await supabase.from('otp_codes').insert({
    user_id: user.id,
    email: user.email,
    code_hash: hashOtp(code),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });

  await sendOtpEmail(user.email, code);
  await logAudit({ userId: user.id, email: user.email, action: 'OTP_REQUESTED', req });

  return NextResponse.json({ ok: true });
}
