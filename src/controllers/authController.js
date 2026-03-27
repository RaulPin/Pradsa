'use strict';
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const config = require('../config');
const { verifyPassword, hashPassword, validatePassword } = require('../utils/password');
const audit = require('../utils/audit');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTokenPayload(user) {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    firstLogin: user.first_login === 1,
  };
}

function setCookie(res, payload) {
  const token = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  res.cookie(config.jwt.cookieName, token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 horas – ISO 27001 control de sesión
  });
  return token;
}

// ─── Controladores ───────────────────────────────────────────────────────────

async function login(req, res) {
  const { email, password } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'] || '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email).trim());

  if (!user || !user.active) {
    audit.log('LOGIN_FAILED', { details: { email, reason: 'user_not_found' }, ip, userAgent: ua });
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  // Verificar bloqueo
  if (user.locked_until) {
    const lockUntil = new Date(user.locked_until);
    if (lockUntil > new Date()) {
      const mins = Math.ceil((lockUntil - Date.now()) / 60000);
      audit.log('LOGIN_BLOCKED', { userId: user.id, details: { remaining_minutes: mins }, ip, userAgent: ua });
      return res.status(429).json({
        error: `Cuenta bloqueada por intentos fallidos. Intenta en ${mins} minuto(s).`,
      });
    }
    // Bloqueo expirado – resetear
    db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?').run(user.id);
  }

  const valid = await verifyPassword(String(password), user.password_hash);

  if (!valid) {
    const attempts = user.failed_attempts + 1;
    const locked = attempts >= config.maxLoginAttempts;
    const lockedUntil = locked
      ? new Date(Date.now() + config.lockoutMinutes * 60000).toISOString()
      : null;

    db.prepare('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?').run(attempts, lockedUntil, user.id);
    audit.log('LOGIN_FAILED', { userId: user.id, details: { attempts, locked }, ip, userAgent: ua });

    if (locked) {
      return res.status(429).json({
        error: `Demasiados intentos fallidos. Cuenta bloqueada por ${config.lockoutMinutes} minutos.`,
      });
    }

    const remaining = config.maxLoginAttempts - attempts;
    return res.status(401).json({
      error: `Credenciales incorrectas. ${remaining} intento(s) restante(s) antes del bloqueo.`,
    });
  }

  // Login correcto
  db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=? WHERE id=?')
    .run(new Date().toISOString(), user.id);

  const payload = buildTokenPayload(user);
  setCookie(res, payload);
  audit.log('LOGIN_SUCCESS', { userId: user.id, ip, userAgent: ua });

  return res.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    firstLogin: user.first_login === 1,
  });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const { userId, email } = req.user;
  const ip = req.ip;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'La nueva contraseña y su confirmación no coinciden' });
  }

  const errors = validatePassword(newPassword, email);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'La contraseña no cumple los requisitos de seguridad', details: errors });
  }

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    audit.log('PASSWORD_CHANGE_FAILED', { userId, details: { reason: 'wrong_current_password' }, ip });
    return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
  }

  // Verificar historial (últimas 5 contraseñas)
  const history = db
    .prepare('SELECT password_hash FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT 5')
    .all(userId);

  for (const h of history) {
    if (await verifyPassword(newPassword, h.password_hash)) {
      return res.status(400).json({ error: 'No puedes reutilizar ninguna de tus últimas 5 contraseñas' });
    }
  }

  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET password_hash=?, first_login=0, password_changed_at=?, updated_at=? WHERE id=?')
    .run(newHash, now, now, userId);

  db.prepare('INSERT INTO password_history (id, user_id, password_hash, created_at) VALUES (?,?,?,?)')
    .run(uuidv4(), userId, newHash, now);

  // Conservar solo las últimas 10 en historial
  db.prepare(`
    DELETE FROM password_history WHERE user_id=? AND id NOT IN (
      SELECT id FROM password_history WHERE user_id=? ORDER BY created_at DESC LIMIT 10
    )
  `).run(userId, userId);

  // Re-emitir token sin firstLogin
  const updatedUser = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  const payload = buildTokenPayload(updatedUser);
  setCookie(res, payload);

  audit.log('PASSWORD_CHANGED', { userId, ip });
  return res.json({ success: true, message: 'Contraseña actualizada correctamente' });
}

function logout(req, res) {
  audit.log('LOGOUT', { userId: req.user?.userId, ip: req.ip });
  res.clearCookie(config.jwt.cookieName);
  return res.json({ success: true });
}

function me(req, res) {
  const user = db
    .prepare('SELECT id, name, email, role, first_login, last_login, password_changed_at FROM users WHERE id=?')
    .get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  return res.json(user);
}

module.exports = { login, changePassword, logout, me };
