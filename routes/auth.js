'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const db = require('../db/database');
const { signToken, requireAuth } = require('../middleware/auth');
const { validatePassword, POLICY } = require('../utils/password');
const { audit } = require('../utils/audit');

const BCRYPT_ROUNDS = 12;

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);

  if (!user) {
    audit({ action: 'LOGIN_FAILED', details: { reason: 'user_not_found', username }, ip, userAgent: ua });
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  if (!user.is_active) {
    audit({ userId: user.id, action: 'LOGIN_FAILED', details: { reason: 'account_inactive' }, ip, userAgent: ua });
    return res.status(401).json({ error: 'Cuenta desactivada. Contacte al administrador.' });
  }

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    audit({ userId: user.id, action: 'LOGIN_FAILED', details: { reason: 'account_locked' }, ip, userAgent: ua });
    return res.status(423).json({ error: `Cuenta bloqueada. Intente en ${remaining} minuto(s).` });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);

  if (!valid) {
    const attempts = user.failed_attempts + 1;
    let lockedUntil = null;
    if (attempts >= POLICY.maxFailedAttempts) {
      lockedUntil = new Date(Date.now() + POLICY.lockoutMinutes * 60000).toISOString();
    }
    db.prepare('UPDATE users SET failed_attempts=?, locked_until=?, updated_at=datetime(\'now\') WHERE id=?')
      .run(attempts, lockedUntil, user.id);
    audit({ userId: user.id, action: 'LOGIN_FAILED', details: { reason: 'wrong_password', attempts }, ip, userAgent: ua });

    if (lockedUntil) {
      return res.status(423).json({ error: `Demasiados intentos fallidos. Cuenta bloqueada ${POLICY.lockoutMinutes} minutos.` });
    }
    const left = POLICY.maxFailedAttempts - attempts;
    return res.status(401).json({ error: `Credenciales incorrectas. ${left} intento(s) restante(s).` });
  }

  // Reset failed attempts and update last_login
  db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=datetime(\'now\'), updated_at=datetime(\'now\') WHERE id=?')
    .run(user.id);

  const token = signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: user.must_change_password === 1,
  });

  audit({ userId: user.id, action: 'LOGIN_SUCCESS', ip, userAgent: ua });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      mustChangePassword: user.must_change_password === 1,
    },
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.user.id;
  const ip = req.ip;
  const ua = req.headers['user-agent'];

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Todos los campos son requeridos.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Las contraseñas nuevas no coinciden.' });
  }

  const { valid, errors } = validatePassword(newPassword);
  if (!valid) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    audit({ userId, action: 'CHANGE_PASSWORD_FAILED', details: { reason: 'wrong_current_password' }, ip, userAgent: ua });
    return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
  }

  // Check password history
  const history = db.prepare(
    'SELECT password_hash FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, POLICY.historyCount);

  for (const h of history) {
    if (bcrypt.compareSync(newPassword, h.password_hash)) {
      return res.status(400).json({ error: `No puede reutilizar ninguna de sus últimas ${POLICY.historyCount} contraseñas.` });
    }
  }

  const newHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);

  const updateUser = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash=?, must_change_password=0, updated_at=datetime(\'now\') WHERE id=?')
      .run(newHash, userId);
    db.prepare('INSERT INTO password_history (id, user_id, password_hash) VALUES (?,?,?)')
      .run(uuidv4(), userId, newHash);
    // Keep only last historyCount entries
    db.prepare(`
      DELETE FROM password_history WHERE user_id=? AND id NOT IN (
        SELECT id FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT ?
      )
    `).run(userId, userId, POLICY.historyCount);
  });
  updateUser();

  audit({ userId, action: 'CHANGE_PASSWORD_SUCCESS', ip, userAgent: ua });

  // Issue new token without mustChangePassword flag
  const token = signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: false,
  });

  res.json({ token, message: 'Contraseña actualizada correctamente.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id,username,email,full_name,role,must_change_password,last_login,created_at FROM users WHERE id=?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(user);
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  audit({ userId: req.user.id, action: 'LOGOUT', ip: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ message: 'Sesión cerrada.' });
});

module.exports = router;
