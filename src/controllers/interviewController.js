'use strict';
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const config = require('../config');
const { sendInterviewInvite } = require('../utils/email');
const audit = require('../utils/audit');

// ─── Entrevistas ─────────────────────────────────────────────────────────────

function listInterviews(req, res) {
  const { userId, role } = req.user;

  const interviews = role === 'admin'
    ? db.prepare(`
        SELECT i.*, u.name AS interviewer_name,
               (SELECT COUNT(*) FROM photos WHERE interview_id=i.id) AS photo_count
        FROM interviews i
        JOIN users u ON i.scheduled_by=u.id
        ORDER BY i.scheduled_at DESC
      `).all()
    : db.prepare(`
        SELECT i.*,
               (SELECT COUNT(*) FROM photos WHERE interview_id=i.id) AS photo_count
        FROM interviews i
        WHERE i.scheduled_by=?
        ORDER BY i.scheduled_at DESC
      `).all(userId);

  return res.json(interviews);
}

async function createInterview(req, res) {
  const { title, type, scheduledAt, intervieweeName, intervieweeEmail, intervieweePhone, intervieweeAddress } = req.body;

  if (!title || !type || !scheduledAt || !intervieweeName || !intervieweeEmail) {
    return res.status(400).json({ error: 'Faltan campos requeridos: título, tipo, fecha, nombre y correo del entrevistado' });
  }
  if (!['pyme', 'fiduciario'].includes(type)) {
    return res.status(400).json({ error: 'Tipo de entrevista inválido. Use "pyme" o "fiduciario"' });
  }

  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'Formato de fecha inválido' });
  }

  const id = uuidv4();
  const joinToken = uuidv4();
  // El enlace es válido desde ahora hasta 48h después de la fecha programada
  const joinTokenExpiresAt = new Date(scheduledDate.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO interviews
      (id, title, type, status, scheduled_by, scheduled_at, interviewee_name,
       interviewee_email, interviewee_phone, interviewee_address,
       join_token, join_token_expires_at, created_at, updated_at)
    VALUES (?,?,?,'scheduled',?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, String(title).trim(), type, req.user.userId,
    scheduledDate.toISOString(),
    String(intervieweeName).trim(),
    String(intervieweeEmail).trim().toLowerCase(),
    intervieweePhone ? String(intervieweePhone).trim() : null,
    intervieweeAddress ? String(intervieweeAddress).trim() : null,
    joinToken, joinTokenExpiresAt, now, now,
  );

  // Crear respuesta de cuestionario vacía
  db.prepare(`
    INSERT INTO questionnaire_responses (id, interview_id, form_type, responses, created_at, updated_at)
    VALUES (?,?,?,'{}',?,?)
  `).run(uuidv4(), id, type, now, now);

  audit.log('INTERVIEW_CREATED', {
    userId: req.user.userId,
    details: { interviewId: id, type, intervieweeEmail },
    ip: req.ip,
  });

  const joinUrl = `${config.appUrl}/join?token=${joinToken}`;

  try {
    await sendInterviewInvite(
      String(intervieweeEmail).trim(),
      String(intervieweeName).trim(),
      String(title).trim(),
      scheduledDate.toISOString(),
      joinUrl,
    );
  } catch (emailErr) {
    console.error('[EMAIL ERROR]', emailErr.message);
    return res.status(201).json({
      success: true,
      interview: { id, joinToken, joinUrl },
      warning: 'Entrevista creada, pero no se pudo enviar el correo al entrevistado. Comparte el enlace manualmente.',
    });
  }

  return res.status(201).json({
    success: true,
    interview: { id, joinToken, joinUrl },
    message: 'Entrevista creada. Se envió la invitación al entrevistado por correo.',
  });
}

function getInterview(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const session = db
    .prepare('SELECT * FROM interview_sessions WHERE interview_id=? ORDER BY created_at DESC LIMIT 1')
    .get(id);
  const photos = db
    .prepare('SELECT id, filename, captured_by, captured_at FROM photos WHERE interview_id=? ORDER BY captured_at')
    .all(id);
  const questionnaire = db
    .prepare('SELECT * FROM questionnaire_responses WHERE interview_id=?')
    .get(id);

  return res.json({ ...interview, session, photos, questionnaire });
}

function updateInterview(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const { title, scheduledAt, notes, status } = req.body;
  const now = new Date().toISOString();
  const updates = { updated_at: now };

  if (title) updates.title = String(title).trim();
  if (scheduledAt) updates.scheduled_at = new Date(scheduledAt).toISOString();
  if (notes !== undefined) updates.notes = notes;
  if (status && ['scheduled', 'cancelled'].includes(status)) updates.status = status;

  const set = Object.keys(updates).map((k) => `${k}=?`).join(', ');
  db.prepare(`UPDATE interviews SET ${set} WHERE id=?`).run(...Object.values(updates), id);

  audit.log('INTERVIEW_UPDATED', { userId, details: { interviewId: id }, ip: req.ip });
  return res.json({ success: true });
}

// ─── Ruta pública – validar token de entrevistado ────────────────────────────

function validateJoinToken(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  const interview = db
    .prepare(`
      SELECT id, title, type, status, scheduled_at,
             interviewee_name, interviewee_address, join_token_expires_at
      FROM interviews WHERE join_token=?
    `)
    .get(String(token));

  if (!interview) return res.status(404).json({ error: 'Enlace de entrevista inválido o no existe' });
  if (interview.status === 'cancelled') return res.status(400).json({ error: 'Esta entrevista fue cancelada' });
  if (interview.status === 'completed') return res.status(400).json({ error: 'Esta entrevista ya fue completada' });
  if (new Date(interview.join_token_expires_at) < new Date()) {
    return res.status(400).json({ error: 'El enlace de esta entrevista ha expirado. Contacta al entrevistador.' });
  }

  return res.json({
    id: interview.id,
    title: interview.title,
    type: interview.type,
    status: interview.status,
    scheduledAt: interview.scheduled_at,
    intervieweeName: interview.interviewee_name,
    declaredAddress: interview.interviewee_address,
  });
}

// ─── Guardar ubicación del entrevistado (pública) ────────────────────────────

function saveLocation(req, res) {
  const { token } = req.query;
  const { latitude, longitude, address } = req.body;

  if (!token) return res.status(400).json({ error: 'Token requerido' });
  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Latitud y longitud son requeridas' });
  }

  const interview = db.prepare('SELECT id, status FROM interviews WHERE join_token=?').get(String(token));
  if (!interview) return res.status(404).json({ error: 'Enlace inválido' });
  if (interview.status === 'cancelled') return res.status(400).json({ error: 'Entrevista cancelada' });

  const session = db
    .prepare('SELECT id FROM interview_sessions WHERE interview_id=? ORDER BY created_at DESC LIMIT 1')
    .get(interview.id);

  const now = new Date().toISOString();

  if (session) {
    db.prepare(`
      UPDATE interview_sessions
      SET interviewee_location_lat=?, interviewee_location_lng=?,
          interviewee_location_address=?, interviewee_ip=?
      WHERE id=?
    `).run(latitude, longitude, address || null, req.ip, session.id);
  } else {
    db.prepare(`
      INSERT INTO interview_sessions
        (id, interview_id, interviewee_location_lat, interviewee_location_lng,
         interviewee_location_address, interviewee_ip, created_at)
      VALUES (?,?,?,?,?,?,?)
    `).run(uuidv4(), interview.id, latitude, longitude, address || null, req.ip, now);
  }

  audit.log('LOCATION_CAPTURED', {
    details: { interviewId: interview.id, lat: latitude, lng: longitude },
    ip: req.ip,
  });

  return res.json({ success: true });
}

// ─── Crear sesión cuando comienza la llamada ──────────────────────────────────

function startSession(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const now = new Date().toISOString();
  const sessionId = uuidv4();

  db.prepare(`
    INSERT INTO interview_sessions (id, interview_id, started_at, created_at)
    VALUES (?,?,?,?)
  `).run(sessionId, id, now, now);

  db.prepare("UPDATE interviews SET status='in_progress', updated_at=? WHERE id=? AND status='scheduled'")
    .run(now, id);

  return res.json({ success: true, sessionId });
}

// ─── Subir foto (entrevistador autenticado) ───────────────────────────────────

function uploadPhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

  const { id } = req.params;
  const { userId, role } = req.user;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const photoId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO photos (id, interview_id, filename, captured_by, captured_at)
    VALUES (?,?,'interviewer',?,?)
  `).run(photoId, id, req.file.filename, now);

  audit.log('PHOTO_CAPTURED', { userId, details: { interviewId: id, photoId }, ip: req.ip });

  return res.status(201).json({
    success: true,
    photo: { id: photoId, filename: req.file.filename, capturedAt: now },
  });
}

// ─── Subir foto (entrevistado vía token – ruta pública) ──────────────────────

function uploadPhotoPublic(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

  const { id } = req.params; // seteado por resolveInterviewFromToken
  const photoId = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO photos (id, interview_id, filename, captured_by, captured_at)
    VALUES (?,?,?,'interviewee',?)
  `).run(photoId, id, req.file.filename, now);

  return res.status(201).json({ success: true });
}

// ─── Cuestionario ────────────────────────────────────────────────────────────

function saveQuestionnaire(req, res) {
  const { id } = req.params;
  const { userId, role } = req.user;
  const { responses, completed } = req.body;

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada' });
  if (role !== 'admin' && interview.scheduled_by !== userId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM questionnaire_responses WHERE interview_id=?').get(id);

  if (existing) {
    db.prepare(`
      UPDATE questionnaire_responses
      SET responses=?, completed=?, completed_at=?, updated_at=?
      WHERE interview_id=?
    `).run(
      JSON.stringify(responses || {}),
      completed ? 1 : 0,
      completed ? now : null,
      now,
      id,
    );
  } else {
    db.prepare(`
      INSERT INTO questionnaire_responses (id, interview_id, form_type, responses, completed, completed_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(uuidv4(), id, interview.type, JSON.stringify(responses || {}), completed ? 1 : 0, completed ? now : null, now, now);
  }

  audit.log('QUESTIONNAIRE_SAVED', { userId, details: { interviewId: id, completed }, ip: req.ip });
  return res.json({ success: true });
}

// ─── Estadísticas (admin) ─────────────────────────────────────────────────────

function getStats(req, res) {
  const total = db.prepare('SELECT COUNT(*) as count FROM interviews').get();
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM interviews GROUP BY status').all();
  const byType = db.prepare('SELECT type, COUNT(*) as count FROM interviews GROUP BY type').all();
  const recent = db.prepare(`
    SELECT i.id, i.title, i.type, i.status, i.scheduled_at, i.interviewee_name, u.name AS interviewer
    FROM interviews i
    JOIN users u ON i.scheduled_by=u.id
    ORDER BY i.created_at DESC LIMIT 5
  `).all();

  return res.json({ total: total.count, byStatus, byType, recent });
}

module.exports = {
  listInterviews, createInterview, getInterview, updateInterview,
  validateJoinToken, saveLocation, startSession,
  uploadPhoto, uploadPhotoPublic,
  saveQuestionnaire, getStats,
};
