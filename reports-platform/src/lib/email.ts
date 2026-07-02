import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Reportes Pradsa <no-reply@example.com>';

const NAVY = '#0e1f3a';
const CRIMSON = '#9b1c31';

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#1e293b;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px">Plataforma de Reportes</h1>
    </div>
    <div style="padding:32px 24px;color:#0f172a">
      <p>Tu código de verificación de un solo uso es:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2563eb;text-align:center;margin:24px 0">
        ${code}
      </div>
      <p style="color:#64748b;font-size:14px">
        Este código expira en <strong>5 minutos</strong>. Si no solicitaste el acceso,
        ignora este mensaje y notifica al administrador.
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;color:#94a3b8;font-size:12px">
      Mensaje automático — no respondas a este correo.
    </div>
  </div>`;

  if (!resend) {
    // Modo desarrollo: registra el código en consola si no hay API key configurada.
    console.log(`[DEV] OTP para ${to}: ${code}`);
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Tu código de acceso',
    html,
  });
}

/**
 * Correo de bienvenida con las credenciales de acceso y el link de la app.
 * Se envía al crear un usuario. Devuelve true si se envió correctamente.
 */
export async function sendWelcomeEmail(
  to: string,
  tempPassword: string,
  appUrl: string
): Promise<boolean> {
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:${NAVY};padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:.5px">Pradsa · Plataforma de Reportes</h1>
    </div>
    <div style="padding:32px 24px;color:#0f172a">
      <p style="margin:0 0 16px">Se ha creado tu cuenta de acceso. Estos son tus datos:</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;width:40%">Correo</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;font-weight:bold">${to}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b">Contraseña temporal</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;font-weight:bold;font-family:monospace">${tempPassword}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:24px 0">
        <a href="${appUrl}" style="display:inline-block;background:${CRIMSON};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:15px">
          Entrar a la plataforma
        </a>
      </div>
      <p style="color:#64748b;font-size:14px;margin:16px 0 0">
        Por seguridad, deberás <strong>cambiar tu contraseña</strong> en el primer ingreso.
        Al iniciar sesión recibirás un <strong>código de verificación</strong> en este correo.
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px;text-align:center;color:#94a3b8;font-size:12px">
      Mensaje automático — no respondas a este correo.
    </div>
  </div>`;

  if (!resend) {
    console.log(`[DEV] Bienvenida para ${to} · pass: ${tempPassword} · ${appUrl}`);
    return true;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Acceso a la Plataforma de Reportes Pradsa',
      html,
    });
    return true;
  } catch {
    return false;
  }
}
