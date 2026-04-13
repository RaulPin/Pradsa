'use strict';

const express = require('express');
const db = require('../database');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// POST /api/location  (employee updates own position)
router.post('/', (req, res) => {
  const { lat, lng, accuracy } = req.body || {};

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat y lng deben ser números' });
  }

  db.transaction(() => {
    // Upsert current location
    db.prepare(`
      INSERT INTO employee_locations (employee_id, lat, lng, accuracy, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(employee_id) DO UPDATE SET
        lat        = excluded.lat,
        lng        = excluded.lng,
        accuracy   = excluded.accuracy,
        updated_at = excluded.updated_at
    `).run(req.user.id, lat, lng, accuracy ?? null);

    // Save to history
    db.prepare(`
      INSERT INTO location_history (employee_id, lat, lng, accuracy, recorded_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(req.user.id, lat, lng, accuracy ?? null);
  })();

  res.json({ message: 'Ubicación actualizada' });
});

// GET /api/location/me
router.get('/me', (req, res) => {
  const loc = db.prepare('SELECT * FROM employee_locations WHERE employee_id = ?').get(req.user.id);
  res.json(loc || null);
});

// GET /api/location/employees  (admin: all active employees with last known position)
router.get('/employees', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT el.employee_id, el.lat, el.lng, el.accuracy, el.updated_at,
           u.name, u.email,
           a.clock_in, a.clock_out
    FROM employee_locations el
    JOIN users u ON u.id = el.employee_id
    LEFT JOIN attendance a
      ON a.employee_id = el.employee_id AND a.date = date('now')
    WHERE u.active = 1
    ORDER BY u.name ASC
  `).all();
  res.json(rows);
});

// GET /api/location/history/:employeeId?date=YYYY-MM-DD  (admin: route history)
router.get('/history/:employeeId', requireRole('admin'), (req, res) => {
  const employeeId = parseInt(req.params.employeeId, 10);
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const points = db.prepare(`
    SELECT lat, lng, accuracy, recorded_at
    FROM location_history
    WHERE employee_id = ?
      AND date(recorded_at) = ?
    ORDER BY recorded_at ASC
  `).all(employeeId, date);

  res.json(points);
});

module.exports = router;
