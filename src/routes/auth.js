'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { auth, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');
const { validatePassword } = require('../passwordPolicy');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE email = ? AND active = 1')
    .get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      must_change_password: user.must_change_password === 1,
    },
  });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const employee = db
    .prepare('SELECT position, department, hire_date, employee_code FROM employees WHERE user_id = ?')
    .get(req.user.id);

  res.json({ ...req.user, employee: employee || null });
});

// POST /api/auth/change-password
router.post('/change-password', auth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  }

  const policyError = validatePassword(new_password);
  if (policyError) return res.status(400).json({ error: policyError });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, row.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hash, req.user.id);

  res.json({ message: 'Contraseña actualizada correctamente' });
});

// PUT /api/auth/me  (used by mobile app)
router.put('/me', auth, (req, res) => {
  const { currentPassword, password } = req.body || {};
  if (!currentPassword || !password) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
  }

  const policyError = validatePassword(password);
  if (policyError) return res.status(400).json({ error: policyError });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hash, req.user.id);

  res.json({ message: 'Contraseña actualizada correctamente' });
});

module.exports = router;
