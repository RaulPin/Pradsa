'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const db = require('../db/database');
const { requireAuth, blockIfMustChange } = require('../middleware/auth');
const { audit } = require('../utils/audit');

// ── Photo storage ─────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'photos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Solo imágenes permitidas.'));
    cb(null, true);
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInterviewOrFail(id, res) {
  const i = db.prepare('SELECT * FROM interviews WHERE id=?').get(id);
  if (!i) { res.status(404).json({ error: 'Entrevista no encontrada.' }); return null; }
  return i;
}

// ── Guest access (no auth) ─────────────────────────────────────────────────

// GET /api/session/guest/:token  – validate guest token and return interview info
router.get('/guest/:token', (req, res) => {
  const interview = db.prepare(`
    SELECT i.id, i.interview_type, i.interviewee_name, i.interviewee_id_doc,
           i.declared_address, i.scheduled_at, i.status, i.room_code,
           u.full_name AS interviewer_name
    FROM interviews i JOIN users u ON u.id=i.interviewer_id
    WHERE i.guest_token=?
  `).get(req.params.token);

  if (!interview) return res.status(404).json({ error: 'Enlace inválido o expirado.' });
  if (interview.status === 'cancelled') return res.status(410).json({ error: 'Esta entrevista ha sido cancelada.' });
  if (interview.status === 'completed') return res.status(410).json({ error: 'Esta entrevista ya fue completada.' });

  res.json(interview);
});

// POST /api/session/guest/:token/location  – save interviewee location
router.post('/guest/:token/location', (req, res) => {
  const { lat, lon } = req.body;
  if (lat == null || lon == null) return res.status(400).json({ error: 'lat y lon requeridos.' });

  const interview = db.prepare('SELECT * FROM interviews WHERE guest_token=?').get(req.params.token);
  if (!interview) return res.status(404).json({ error: 'Enlace inválido.' });

  // Simple distance check (Haversine) – not blocking, just informational
  const distanceM = interview.location_lat
    ? haversineMeters(lat, lon, interview.location_lat, interview.location_lon)
    : null;

  db.prepare(`UPDATE interviews SET location_lat=?, location_lon=?, location_verified=1,
    location_distance_m=?, updated_at=datetime('now') WHERE guest_token=?`)
    .run(lat, lon, distanceM, req.params.token);

  res.json({ verified: true, distanceM });
});

// POST /api/session/guest/:token/join  – mark interviewee joined
router.post('/guest/:token/join', (req, res) => {
  const interview = db.prepare("SELECT * FROM interviews WHERE guest_token=?").get(req.params.token);
  if (!interview) return res.status(404).json({ error: 'Enlace inválido.' });
  if (interview.status === 'scheduled') {
    db.prepare("UPDATE interviews SET status='waiting', updated_at=datetime('now') WHERE guest_token=?")
      .run(req.params.token);
  }
  res.json({ roomCode: interview.room_code });
});

// ── Authenticated session routes ───────────────────────────────────────────

// POST /api/session/:id/start
router.post('/:id/start', requireAuth, blockIfMustChange, (req, res) => {
  const interview = getInterviewOrFail(req.params.id, res);
  if (!interview) return;
  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  db.prepare("UPDATE interviews SET status='in_progress', started_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(req.params.id);
  audit({ userId: req.user.id, action: 'INTERVIEW_STARTED', resource: req.params.id, ip: req.ip });
  res.json({ message: 'Entrevista iniciada.' });
});

// POST /api/session/:id/end
router.post('/:id/end', requireAuth, blockIfMustChange, (req, res) => {
  const interview = getInterviewOrFail(req.params.id, res);
  if (!interview) return;
  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  db.prepare("UPDATE interviews SET status='completed', ended_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .run(req.params.id);
  audit({ userId: req.user.id, action: 'INTERVIEW_ENDED', resource: req.params.id, ip: req.ip });
  res.json({ message: 'Entrevista finalizada.' });
});

// POST /api/session/guest/:token/end  – guest can also end
router.post('/guest/:token/end', (req, res) => {
  const interview = db.prepare('SELECT * FROM interviews WHERE guest_token=?').get(req.params.token);
  if (!interview) return res.status(404).json({ error: 'Enlace inválido.' });
  if (interview.status === 'in_progress') {
    db.prepare("UPDATE interviews SET status='completed', ended_at=datetime('now'), updated_at=datetime('now') WHERE guest_token=?")
      .run(req.params.token);
  }
  res.json({ message: 'Entrevista finalizada por el entrevistado.' });
});

// POST /api/session/:id/photos  – upload photo (interviewer)
router.post('/:id/photos', requireAuth, blockIfMustChange, upload.single('photo'), (req, res) => {
  const interview = getInterviewOrFail(req.params.id, res);
  if (!interview) return;
  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

  const photoId = uuidv4();
  db.prepare('INSERT INTO interview_photos (id, interview_id, filename, captured_by) VALUES (?,?,?,?)')
    .run(photoId, req.params.id, req.file.filename, 'interviewer');

  audit({ userId: req.user.id, action: 'PHOTO_CAPTURED', resource: req.params.id, ip: req.ip });
  res.json({ id: photoId, filename: req.file.filename });
});

// POST /api/session/guest/:token/photos  – upload photo (interviewee side)
router.post('/guest/:token/photos', upload.single('photo'), (req, res) => {
  const interview = db.prepare('SELECT * FROM interviews WHERE guest_token=?').get(req.params.token);
  if (!interview) return res.status(404).json({ error: 'Enlace inválido.' });
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

  const photoId = uuidv4();
  db.prepare('INSERT INTO interview_photos (id, interview_id, filename, captured_by) VALUES (?,?,?,?)')
    .run(photoId, interview.id, req.file.filename, 'guest');

  res.json({ id: photoId, filename: req.file.filename });
});

// POST /api/session/:id/questionnaire  – save questionnaire answer(s)
router.post('/:id/questionnaire', requireAuth, blockIfMustChange, (req, res) => {
  const interview = getInterviewOrFail(req.params.id, res);
  if (!interview) return;
  if (req.user.role !== 'admin' && interview.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  const { answers } = req.body; // [{ section, questionKey, questionText, answer }]
  if (!Array.isArray(answers) || !answers.length) {
    return res.status(400).json({ error: 'Se esperaba un array de respuestas.' });
  }

  const upsert = db.prepare(`
    INSERT INTO questionnaire_responses (id, interview_id, section, question_key, question_text, answer, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(interview_id, question_key) DO UPDATE SET answer=excluded.answer, question_text=excluded.question_text, updated_at=excluded.updated_at
  `);

  const saveAll = db.transaction((items) => {
    for (const a of items) upsert.run(uuidv4(), req.params.id, a.section, a.questionKey, a.questionText, a.answer ?? null);
  });
  saveAll(answers);

  res.json({ message: 'Respuestas guardadas.' });
});

// GET /api/session/photos/:filename – serve photo (auth required)
router.get('/photos/:filename', requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Imagen no encontrada.' });
  res.sendFile(filePath);
});

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = router;
