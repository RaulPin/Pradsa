'use strict';
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const uploadRecording = upload.recording;
const ctrl = require('../controllers/interviewController');
const { requireAdmin } = require('../middleware/auth');
const db = require('../db/database');

const router = Router();

// Rate limit para rutas públicas del entrevistado
const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta en unos minutos.' },
});

// Middleware: resuelve el interview_id a partir del join_token para rutas públicas de carga de fotos
function resolveInterviewFromToken(req, res, next) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  const interview = db
    .prepare('SELECT id, status FROM interviews WHERE join_token=?')
    .get(String(token));

  if (!interview) return res.status(404).json({ error: 'Enlace de entrevista inválido' });
  if (interview.status === 'cancelled') return res.status(400).json({ error: 'Entrevista cancelada' });

  req.params.id = interview.id; // Para que multer use el directorio correcto
  next();
}

// ─── Rutas públicas (entrevistado) ───────────────────────────────────────────
router.get('/join', publicLimiter, ctrl.validateJoinToken);
router.post('/join/location', publicLimiter, ctrl.saveLocation);
router.post('/join/photo', publicLimiter, resolveInterviewFromToken, upload.single('photo'), ctrl.uploadPhotoPublic);

// ─── Rutas protegidas (entrevistador / admin) ─────────────────────────────────
router.use(requireAuth);

router.get('/', ctrl.listInterviews);
router.post('/', ctrl.createInterview);
router.get('/stats',       ctrl.getStats);
router.get('/kpi-summary', requireAdmin, ctrl.getKpiSummary);
router.get('/:id', ctrl.getInterview);
router.patch('/:id', ctrl.updateInterview);
router.post('/:id/session/start', ctrl.startSession);
router.post('/:id/photos', upload.single('photo'), ctrl.uploadPhoto);
router.post('/:id/questionnaire', ctrl.saveQuestionnaire);
router.post('/:id/recording', uploadRecording.single('recording'), ctrl.saveRecording);

module.exports = router;
