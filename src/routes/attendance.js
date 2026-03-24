'use strict';

const express = require('express');
const db = require('../database');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/attendance  (admin: all employees, with optional ?date=&start=&end=)
router.get('/', requireRole('admin'), (req, res) => {
  const { date, start, end } = req.query;
  let query = `
    SELECT a.*, u.name AS employee_name
    FROM attendance a
    JOIN users u ON u.id = a.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (date)  { query += ' AND a.date = ?';   params.push(date); }
  if (start) { query += ' AND a.date >= ?';  params.push(start); }
  if (end)   { query += ' AND a.date <= ?';  params.push(end); }
  query += ' ORDER BY a.date DESC, u.name ASC';

  res.json(db.prepare(query).all(...params));
});

// GET /api/attendance/today  (own record)
router.get('/today', (req, res) => {
  const record = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
    .get(req.user.id, todayDate());
  res.json(record || { employee_id: req.user.id, date: todayDate(), clock_in: null, clock_out: null });
});

// POST /api/attendance/clock-in
router.post('/clock-in', (req, res) => {
  const { lat, lng } = req.body || {};
  const date = todayDate();

  const existing = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
    .get(req.user.id, date);

  if (existing?.clock_in) {
    return res.status(409).json({ error: 'Ya registraste tu entrada hoy' });
  }

  const now = new Date().toISOString();

  if (existing) {
    db.prepare('UPDATE attendance SET clock_in = ?, clock_in_lat = ?, clock_in_lng = ? WHERE employee_id = ? AND date = ?')
      .run(now, lat ?? null, lng ?? null, req.user.id, date);
  } else {
    db.prepare('INSERT INTO attendance (employee_id, date, clock_in, clock_in_lat, clock_in_lng) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, date, now, lat ?? null, lng ?? null);
  }

  res.json(db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(req.user.id, date));
});

// POST /api/attendance/clock-out
router.post('/clock-out', (req, res) => {
  const { lat, lng, notes } = req.body || {};
  const date = todayDate();

  const record = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
    .get(req.user.id, date);

  if (!record?.clock_in) {
    return res.status(400).json({ error: 'No has registrado tu entrada hoy' });
  }
  if (record.clock_out) {
    return res.status(409).json({ error: 'Ya registraste tu salida hoy' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE attendance SET clock_out = ?, clock_out_lat = ?, clock_out_lng = ?, notes = ? WHERE employee_id = ? AND date = ?')
    .run(now, lat ?? null, lng ?? null, notes || null, req.user.id, date);

  res.json(db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(req.user.id, date));
});

// GET /api/attendance/:employeeId  (admin or own records, optional ?start=&end=)
router.get('/:employeeId', (req, res) => {
  const employeeId = parseInt(req.params.employeeId, 10);
  if (req.user.role !== 'admin' && req.user.id !== employeeId) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const { start, end } = req.query;
  let query = 'SELECT * FROM attendance WHERE employee_id = ?';
  const params = [employeeId];
  if (start) { query += ' AND date >= ?'; params.push(start); }
  if (end)   { query += ' AND date <= ?'; params.push(end); }
  query += ' ORDER BY date DESC';

  res.json(db.prepare(query).all(...params));
});

module.exports = router;
