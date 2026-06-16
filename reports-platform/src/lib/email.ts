import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'Reportes Pradsa <no-reply@example.com>';

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
