'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { auth, requireRole } = require('../middleware/auth');
const { validatePassword } = require('../passwordPolicy');

const router = express.Router();
router.use(auth);

const SELECT_EMPLOYEE = `
  SELECT u.id, u.email, u.name, u.role, u.phone, u.active, u.created_at,
         e.position, e.department, e.hire_date, e.employee_code
  FROM users u
  LEFT JOIN employees e ON e.user_id = u.id
  WHERE u.id = ?
`;

// GET /api/employees
router.get('/', (req, res) => {
  if (req.user.role === 'admin') {
    const rows = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.phone, u.active, u.created_at,
             e.position, e.department, e.hire_date, e.employee_code
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE u.role = 'employee'
      ORDER BY u.name ASC
    `).all();
    return res.json(rows);
  }
  const row = db.prepare(SELECT_EMPLOYEE).get(req.user.id);
  res.json(row ? [row] : []);
});

// GET /api/employees/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  const row = db.prepare(SELECT_EMPLOYEE).get(id);
  if (!row) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json(row);
});

// POST /api/employees  (admin only)
router.post('/', requireRole('admin'), (req, res) => {
  const { email, password, name, phone, position, department, hire_date, employee_code } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
  }

  const policyError = validatePassword(password);
  if (policyError) return res.status(400).json({ error: policyError });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'El email ya está registrado' });

  const hash = bcrypt.hashSync(password, 10);

  const newId = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (email, password_hash, name, role, phone, must_change_password) VALUES (?, ?, ?, 'employee', ?, 1)")
      .run(email.toLowerCase().trim(), hash, name.trim(), phone || null);

    db.prepare(
      'INSERT INTO employees (user_id, position, department, hire_date, employee_code) VALUES (?, ?, ?, ?, ?)'
    ).run(lastInsertRowid, position || null, department || null, hire_date || null, employee_code || null);

    return lastInsertRowid;
  })();

  res.status(201).json(db.prepare(SELECT_EMPLOYEE).get(newId));
});

// PUT /api/employees/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const target = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'employee'").get(id);
  if (!target) return res.status(404).json({ error: 'Empleado no encontrado' });

  const { name, phone, position, department, hire_date, employee_code, active } = req.body || {};

  db.transaction(() => {
    if (name !== undefined || phone !== undefined || (req.user.role === 'admin' && active !== undefined)) {
      db.prepare(`
        UPDATE users SET
          name   = CASE WHEN ? IS NOT NULL THEN ? ELSE name END,
          phone  = CASE WHEN ? IS NOT NULL THEN ? ELSE phone END,
          active = CASE WHEN ? IS NOT NULL THEN ? ELSE active END
        WHERE id = ?
      `).run(
        name ?? null, name ?? null,
        phone ?? null, phone ?? null,
        req.user.role === 'admin' ? (active ?? null) : null,
        req.user.role === 'admin' ? (active ?? null) : null,
        id
      );
    }

    if (position !== undefined || department !== undefined || hire_date !== undefined || employee_code !== undefined) {
      db.prepare(`
        INSERT INTO employees (user_id, position, department, hire_date, employee_code)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          position      = CASE WHEN excluded.position IS NOT NULL      THEN excluded.position      ELSE position      END,
          department    = CASE WHEN excluded.department IS NOT NULL    THEN excluded.department    ELSE department    END,
          hire_date     = CASE WHEN excluded.hire_date IS NOT NULL     THEN excluded.hire_date     ELSE hire_date     END,
          employee_code = CASE WHEN excluded.employee_code IS NOT NULL THEN excluded.employee_code ELSE employee_code END
      `).run(id, position || null, department || null, hire_date || null, employee_code || null);
    }
  })();

  res.json(db.prepare(SELECT_EMPLOYEE).get(id));
});

// DELETE /api/employees/:id  (admin: soft-delete / deactivate)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = db.prepare("UPDATE users SET active = 0 WHERE id = ? AND role = 'employee'").run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Empleado no encontrado' });
  res.json({ message: 'Empleado desactivado correctamente' });
});

module.exports = router;
