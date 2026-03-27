'use strict';
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.auth,
    });
  }
  return transporter;
}

async function sendWelcomeEmail(to, name, tempPassword) {
  const t = getTransporter();
  await t.sendMail({
    from: config.smtp.from,
    to,
    subject: 'Bienvenido a EntrevistasPradsa – Credenciales de acceso',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
        <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px;margin-bottom:24px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">EntrevistasPradsa</h1>
        </div>
        <p style="color:#1e293b;">Hola <strong>${name}</strong>,</p>
        <p style="color:#1e293b;">Tu cuenta ha sido creada en la plataforma EntrevistasPradsa.</p>
        <div style="background:#ffffff;border:1px solid #e2e8f0;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;color:#475569;"><strong>Usuario:</strong> ${to}</p>
          <p style="margin:10px 0 0;color:#475569;"><strong>Contraseña temporal:</strong></p>
          <p style="margin:6px 0 0;font-family:monospace;font-size:18px;background:#f1f5f9;padding:10px;border-radius:6px;color:#0f172a;letter-spacing:1px;">${tempPassword}</p>
        </div>
        <div style="background:#fef9c3;border-left:4px solid #ca8a04;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
          <p style="margin:0;color:#854d0e;font-size:14px;"><strong>⚠️ Importante:</strong> Deberás cambiar esta contraseña en tu primer ingreso. El sistema te pedirá establecer una contraseña nueva y segura.</p>
        </div>
        <a href="${config.appUrl}/login" style="background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold;">Iniciar sesión</a>
        <hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0;">
        <p style="font-size:12px;color:#94a3b8;">Este mensaje fue generado automáticamente. Si no solicitaste este acceso, comunícate de inmediato con el administrador.</p>
      </div>
    `,
  });
}

async function sendInterviewInvite(to, intervieweeName, interviewTitle, scheduledAt, joinUrl) {
  const t = getTransporter();

  const dateStr = new Date(scheduledAt).toLocaleString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await t.sendMail({
    from: config.smtp.from,
    to,
    subject: `Invitación a entrevista – ${interviewTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:12px;">
        <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px;margin-bottom:24px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">EntrevistasPradsa</h1>
        </div>
        <p style="color:#1e293b;">Hola <strong>${intervieweeName}</strong>,</p>
        <p style="color:#1e293b;">Has sido invitado/a a una entrevista de crédito a través de la plataforma EntrevistasPradsa.</p>
        <div style="background:#ffffff;border:1px solid #e2e8f0;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;color:#475569;"><strong>Entrevista:</strong> ${interviewTitle}</p>
          <p style="margin:10px 0 0;color:#475569;"><strong>Fecha y hora programada:</strong><br>${dateStr}</p>
        </div>
        <p style="color:#1e293b;">Para unirte a la entrevista, haz clic en el siguiente enlace:</p>
        <a href="${joinUrl}" style="background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold;margin-bottom:16px;">Unirme a la entrevista</a>
        <p style="font-size:13px;color:#64748b;word-break:break-all;">O copia este enlace: ${joinUrl}</p>
        <div style="background:#fef9c3;border-left:4px solid #ca8a04;padding:12px 16px;border-radius:4px;margin:20px 0;">
          <p style="margin:0;color:#854d0e;font-size:14px;"><strong>⚠️ Importante:</strong> Para participar en la entrevista es obligatorio que concedas acceso a tu <strong>cámara</strong>, <strong>micrófono</strong> y <strong>ubicación GPS</strong>. Esto es requerido para verificar que te encuentras en la dirección declarada.</p>
        </div>
        <p style="font-size:13px;color:#64748b;">Este enlace es personal e intransferible. No lo compartas con nadie.</p>
        <hr style="margin:32px 0;border:none;border-top:1px solid #e2e8f0;">
        <p style="font-size:12px;color:#94a3b8;">Este mensaje fue generado automáticamente por EntrevistasPradsa.</p>
      </div>
    `,
  });
}

module.exports = { sendWelcomeEmail, sendInterviewInvite };
