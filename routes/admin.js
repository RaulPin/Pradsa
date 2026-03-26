'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { generatePassword, validatePassword } = require('../utils/password');
const { audit } = require('../utils/audit');

const BCRYPT_ROUNDS = 12;

// All admin routes require admin role
router.use(requireAdmin);

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, full_name, role, is_active, must_change_password,
           failed_attempts, locked_until, last_login, created_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', (req, res) => {
  const { username, email, fullName, role } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  if (!username || !email || !fullName || !role) {
    return res.status(400).json({ error: 'username, email, fullName y role son requeridos.' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'role debe ser admin o user.' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email);
  if (exists) return res.status(409).json({ error: 'El usuario o correo ya existe.' });

  const id = uuidv4();
  const tempPassword = generatePassword();
  const hash = bcrypt.hashSync(tempPassword, BCRYPT_ROUNDS);

  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, email, full_name, password_hash, role, must_change_password)
      VALUES (?,?,?,?,?,?,1)
    `).run(id, username, email, fullName, hash, role);
    db.prepare('INSERT INTO password_history (id, user_id, password_hash) VALUES (?,?,?)')
      .run(uuidv4(), id, hash);
  });
  create();

  audit({ userId: req.user.id, action: 'USER_CREATED', resource: id, details: { username, email, role }, ip, userAgent: ua });

  res.status(201).json({
    user: { id, username, email, fullName, role },
    temporaryPassword: tempPassword,
    message: 'Usuario creado. Comparta la contraseña temporal de forma segura.',
  });
});

// PUT /api/admin/users/:id
router.put('/users/:id', (req, res) => {
  const { id } = req.params;
  const { fullName, email, role, isActive } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  // Prevent deactivating own account
  if (req.user.id === id && isActive === false) {
    return res.status(400).json({ error: 'No puede desactivar su propia cuenta.' });
  }

  const updates = [];
  const values = [];
  if (fullName !== undefined) { updates.push('full_name=?'); values.push(fullName); }
  if (email !== undefined)    { updates.push('email=?'); values.push(email); }
  if (role !== undefined && ['admin','user'].includes(role)) { updates.push('role=?'); values.push(role); }
  if (isActive !== undefined) { updates.push('is_active=?'); values.push(isActive ? 1 : 0); }

  if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar.' });

  updates.push("updated_at=datetime('now')");
  values.push(id);

  db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...values);
  audit({ userId: req.user.id, action: 'USER_UPDATED', resource: id, details: req.body, ip: req.ip });

  res.json({ message: 'Usuario actualizado.' });
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const tempPassword = generatePassword();
  const hash = bcrypt.hashSync(tempPassword, BCRYPT_ROUNDS);

  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=?, must_change_password=1, failed_attempts=0, locked_until=NULL, updated_at=datetime(\'now\') WHERE id=?')
      .run(hash, id);
    db.prepare('INSERT INTO password_history (id, user_id, password_hash) VALUES (?,?,?)')
      .run(uuidv4(), id, hash);
  })();

  audit({ userId: req.user.id, action: 'PASSWORD_RESET', resource: id, ip: req.ip });

  res.json({ temporaryPassword: tempPassword, message: 'Contraseña reiniciada. El usuario debe cambiarla en su próximo inicio.' });
});

// POST /api/admin/users/:id/unlock
router.post('/users/:id/unlock', (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, updated_at=datetime(\'now\') WHERE id=?').run(id);
  audit({ userId: req.user.id, action: 'USER_UNLOCKED', resource: id, ip: req.ip });
  res.json({ message: 'Cuenta desbloqueada.' });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const totalUsers    = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user'").get().c;
  const activeUsers   = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='user' AND is_active=1").get().c;
  const totalInterview= db.prepare("SELECT COUNT(*) as c FROM interviews").get().c;
  const scheduled     = db.prepare("SELECT COUNT(*) as c FROM interviews WHERE status='scheduled'").get().c;
  const inProgress    = db.prepare("SELECT COUNT(*) as c FROM interviews WHERE status='in_progress'").get().c;
  const completed     = db.prepare("SELECT COUNT(*) as c FROM interviews WHERE status='completed'").get().c;
  const pyme          = db.prepare("SELECT COUNT(*) as c FROM interviews WHERE interview_type='pyme'").get().c;
  const fiduciario    = db.prepare("SELECT COUNT(*) as c FROM interviews WHERE interview_type='fiduciario'").get().c;

  res.json({ totalUsers, activeUsers, totalInterview, scheduled, inProgress, completed, pyme, fiduciario });
});

// GET /api/admin/interviews
router.get('/interviews', (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, u.full_name AS interviewer_name, u.username AS interviewer_username
    FROM interviews i
    JOIN users u ON u.id = i.interviewer_id
    ORDER BY i.scheduled_at DESC
    LIMIT 200
  `).all();
  res.json(rows);
});

// GET /api/admin/audit-logs
router.get('/audit-logs', (req, res) => {
  const { limit = 100, offset = 0, userId, action } = req.query;
  let query = 'SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE 1=1';
  const params = [];
  if (userId) { query += ' AND al.user_id=?'; params.push(userId); }
  if (action)  { query += ' AND al.action LIKE ?'; params.push(`%${action}%`); }
  query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

module.exports = router;
