'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const router = express.Router();

const db = require('../db/database');
const { requireAuth, blockIfMustChange } = require('../middleware/auth');
const { audit } = require('../utils/audit');

router.use(requireAuth, blockIfMustChange);

function generateRoomCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
function generateGuestToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// GET /api/interviews
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare(`
      SELECT i.*, u.full_name AS interviewer_name
      FROM interviews i JOIN users u ON u.id=i.interviewer_id
      ORDER BY i.scheduled_at DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT i.*, u.full_name AS interviewer_name
      FROM interviews i JOIN users u ON u.id=i.interviewer_id
      WHERE i.interviewer_id=?
      ORDER BY i.scheduled_at DESC
    `).all(req.user.id);
  }
  res.json(rows);
});

// POST /api/interviews
router.post('/', (req, res) => {
  const {
    interviewType, intervieweeName, intervieweeIdDoc,
    intervieweeEmail, intervieweePhone,
    declaredAddress, scheduledAt,
  } = req.body;

  if (!interviewType || !intervieweeName || !intervieweeIdDoc || !declaredAddress || !scheduledAt) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }
  if (!['pyme', 'fiduciario'].includes(interviewType)) {
    return res.status(400).json({ error: 'Tipo de entrevista inválido (pyme o fiduciario).' });
  }

  const id = uuidv4();
  const roomCode = generateRoomCode();
  const guestToken = generateGuestToken();

  db.prepare(`
    INSERT INTO interviews
      (id, interviewer_id, interview_type, interviewee_name, interviewee_id_doc,
       interviewee_email, interviewee_phone, declared_address, scheduled_at, room_code, guest_token)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, req.user.id, interviewType, intervieweeName, intervieweeIdDoc,
         intervieweeEmail || null, intervieweePhone || null,
         declaredAddress, scheduledAt, roomCode, guestToken);

  audit({ userId: req.user.id, action: 'INTERVIEW_CREATED', resource: id, ip: req.ip });

  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  res.status(201).json(interview);
});

// GET /api/interviews/:id
router.get('/:id', (req, res) => {
  const interview = db.prepare(`
    SELECT i.*, u.full_name AS interviewer_name, u.email AS interviewer_email
    FROM interviews i JOIN users u ON u.id=i.interviewer_id
    WHERE i.id=?
  `).get(req.params.id);

  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada.' });

  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  // Attach photos and questionnaire
  const photos = db.prepare('SELECT * FROM interview_photos WHERE interview_id=? ORDER BY captured_at').all(req.params.id);
  const answers = db.prepare('SELECT * FROM questionnaire_responses WHERE interview_id=? ORDER BY section, question_key').all(req.params.id);

  res.json({ ...interview, photos, questionnaire: answers });
});

// PUT /api/interviews/:id
router.put('/:id', (req, res) => {
  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(req.params.id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada.' });
  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  if (['completed','cancelled'].includes(interview.status)) {
    return res.status(400).json({ error: 'No se puede modificar una entrevista finalizada.' });
  }

  const { scheduledAt, status, notes, declaredAddress } = req.body;
  const updates = [];
  const values = [];
  if (scheduledAt)    { updates.push('scheduled_at=?'); values.push(scheduledAt); }
  if (status)         { updates.push('status=?'); values.push(status); }
  if (notes !== undefined) { updates.push('notes=?'); values.push(notes); }
  if (declaredAddress){ updates.push('declared_address=?'); values.push(declaredAddress); }
  updates.push("updated_at=datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE interviews SET ${updates.join(',')} WHERE id=?`).run(...values);
  audit({ userId: req.user.id, action: 'INTERVIEW_UPDATED', resource: req.params.id, ip: req.ip });
  res.json({ message: 'Entrevista actualizada.' });
});

// DELETE /api/interviews/:id  (cancel)
router.delete('/:id', (req, res) => {
  const interview = db.prepare('SELECT * FROM interviews WHERE id=?').get(req.params.id);
  if (!interview) return res.status(404).json({ error: 'Entrevista no encontrada.' });
  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  db.prepare("UPDATE interviews SET status='cancelled', updated_at=datetime('now') WHERE id=?").run(req.params.id);
  audit({ userId: req.user.id, action: 'INTERVIEW_CANCELLED', resource: req.params.id, ip: req.ip });
  res.json({ message: 'Entrevista cancelada.' });
});

module.exports = router;
