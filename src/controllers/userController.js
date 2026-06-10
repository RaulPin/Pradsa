'use strict';
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { generateTempPassword, hashPassword } = require('../utils/password');
const { sendWelcomeEmail } = require('../utils/email');
const audit = require('../utils/audit');

async function createUser(req, res) {
  const { name, email, role = 'user' } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Nombre y email son requeridos' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido. Debe ser "admin" o "user"' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico' });
  }

  const tempPass = generateTempPassword();
  const hash = await hashPassword(tempPass);
  const now = new Date().toISOString();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, first_login, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, String(name).trim(), normalizedEmail, hash, role, now, now, req.user.userId);

  db.prepare('INSERT INTO password_history (id, user_id, password_hash, created_at) VALUES (?,?,?,?)')
    .run(uuidv4(), id, hash, now);

  audit.log('USER_CREATED', {
    userId: req.user.userId,
    details: { newUserId: id, email: normalizedEmail, role },
    ip: req.ip,
  });

  // Enviar correo con credenciales
  try {
    await sendWelcomeEmail(normalizedEmail, String(name).trim(), tempPass);
  } catch (emailErr) {
    console.error('[EMAIL ERROR]', emailErr.message);
    return res.status(201).json({
      success: true,
      user: { id, name: String(name).trim(), email: normalizedEmail, role },
      warning: 'Usuario creado, pero no se pudo enviar el correo. Comparte la contraseña temporal de forma segura.',
      tempPassword: tempPass,
    });
  }

  return res.status(201).json({
    success: true,
    user: { id, name: String(name).trim(), email: normalizedEmail, role },
    message: 'Usuario creado. Se enviaron las credenciales de acceso por correo electrónico.',
  });
}

function listUsers(req, res) {
  const users = db
    .prepare(`
      SELECT id, name, email, role, first_login, failed_attempts,
             locked_until, last_login, password_changed_at, created_at, active
      FROM users
      ORDER BY created_at DESC
    `)
    .all();
  return res.json(users);
}

function getUser(req, res) {
  const user = db
    .prepare(`
      SELECT id, name, email, role, first_login, failed_attempts,
             locked_until, last_login, password_changed_at, created_at, active
      FROM users WHERE id=?
    `)
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json(user);
}

function updateUser(req, res) {
  const { id } = req.params;
  const { name, role, active } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // No puede desactivarse a sí mismo
  if (id === req.user.userId && active === false) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  }
  // No puede quitarse el rol de admin si es el único admin activo
  if (id === req.user.userId && role === 'user') {
    const admins = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role='admin' AND active=1").get();
    if (admins.cnt <= 1) {
      return res.status(400).json({ error: 'No puedes quitarte el rol de administrador: eres el único administrador activo' });
    }
  }

  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (role !== undefined && ['admin', 'user'].includes(role)) updates.role = role;
  if (active !== undefined) updates.active = active ? 1 : 0;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No se proporcionaron campos para actualizar' });
  }

  updates.updated_at = new Date().toISOString();
  const set = Object.keys(updates).map((k) => `${k}=?`).join(', ');
  db.prepare(`UPDATE users SET ${set} WHERE id=?`).run(...Object.values(updates), id);

  audit.log('USER_UPDATED', {
    userId: req.user.userId,
    details: { targetId: id, changes: updates },
    ip: req.ip,
  });

  return res.json({ success: true });
}

function unlockUser(req, res) {
  const { id } = req.params;
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, updated_at=? WHERE id=?').run(now, id);
  audit.log('USER_UNLOCKED', { userId: req.user.userId, details: { targetId: id }, ip: req.ip });
  return res.json({ success: true, message: 'Cuenta desbloqueada correctamente' });
}

function getAuditLogs(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '100'), 500);
  const offset = parseInt(req.query.offset || '0');
  const action = req.query.action || null;

  const where = action ? 'WHERE l.action=?' : '';
  const params = action ? [action, limit, offset] : [limit, offset];

  const logs = db
    .prepare(`
      SELECT l.*, u.name as user_name, u.email as user_email
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params);

  return res.json(logs);
}

module.exports = { createUser, listUsers, getUser, updateUser, unlockUser, getAuditLogs };
