'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../database');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ── Storage ──────────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads', 'photos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpeg, png, webp, gif)'));
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
// Ensure photo_uploads table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS photo_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename    TEXT    NOT NULL,
    caption     TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_photos_emp ON photo_uploads(employee_id, created_at);
`);

// ── POST /api/photos ─ upload a photo ────────────────────────────────────────
router.post('/', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
  const caption = (req.body.caption || '').trim().slice(0, 200);

  const result = db.prepare(
    'INSERT INTO photo_uploads (employee_id, filename, caption) VALUES (?, ?, ?)'
  ).run(req.user.id, req.file.filename, caption || null);

  res.status(201).json({
    id: result.lastInsertRowid,
    filename: req.file.filename,
    caption,
    created_at: new Date().toISOString(),
  });
});

// ── GET /api/photos ─ list photos ─────────────────────────────────────────────
// Admin: all photos (optional ?employee_id=)
// Employee: own photos only
router.get('/', (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    const empId = req.query.employee_id ? parseInt(req.query.employee_id, 10) : null;
    if (empId) {
      rows = db.prepare(`
        SELECT p.id, p.filename, p.caption, p.created_at,
               u.name AS employee_name, u.id AS employee_id
        FROM photo_uploads p
        JOIN users u ON u.id = p.employee_id
        WHERE p.employee_id = ?
        ORDER BY p.created_at DESC
      `).all(empId);
    } else {
      rows = db.prepare(`
        SELECT p.id, p.filename, p.caption, p.created_at,
               u.name AS employee_name, u.id AS employee_id
        FROM photo_uploads p
        JOIN users u ON u.id = p.employee_id
        ORDER BY p.created_at DESC
        LIMIT 200
      `).all();
    }
  } else {
    rows = db.prepare(`
      SELECT id, filename, caption, created_at
      FROM photo_uploads
      WHERE employee_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);
  }
  res.json(rows);
});

// ── GET /api/photos/:id/file ─ serve image ────────────────────────────────────
router.get('/:id/file', (req, res) => {
  const photo = db.prepare('SELECT * FROM photo_uploads WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada.' });

  // Employees can only see own photos
  if (req.user.role !== 'admin' && photo.employee_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  const filePath = path.join(UPLOAD_DIR, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });

  res.sendFile(filePath);
});

// ── GET /api/photos/:id/download ─ force download ─────────────────────────────
router.get('/:id/download', requireRole('admin'), (req, res) => {
  const photo = db.prepare('SELECT * FROM photo_uploads WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada.' });

  const filePath = path.join(UPLOAD_DIR, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado.' });

  res.download(filePath, photo.filename);
});

// ── DELETE /api/photos/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM photo_uploads WHERE id = ?').get(req.params.id);
  if (!photo) return res.status(404).json({ error: 'Foto no encontrada.' });

  // Only admin or owner can delete
  if (req.user.role !== 'admin' && photo.employee_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado.' });
  }

  db.prepare('DELETE FROM photo_uploads WHERE id = ?').run(photo.id);

  const filePath = path.join(UPLOAD_DIR, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.json({ success: true });
});

module.exports = router;
