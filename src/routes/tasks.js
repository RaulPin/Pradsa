'use strict';

const express = require('express');
const db = require('../database');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const VALID_STATUSES   = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

const SELECT_TASK = `
  SELECT t.*,
         u1.name AS assigned_to_name,
         u2.name AS assigned_by_name
  FROM tasks t
  LEFT JOIN users u1 ON u1.id = t.assigned_to
  LEFT JOIN users u2 ON u2.id = t.assigned_by
`;

// GET /api/tasks
router.get('/', (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`${SELECT_TASK} ORDER BY t.created_at DESC`).all()
    : db.prepare(`${SELECT_TASK} WHERE t.assigned_to = ? ORDER BY t.created_at DESC`).all(req.user.id);
  res.json(rows);
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.prepare(`${SELECT_TASK} WHERE t.id = ?`).get(id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (req.user.role !== 'admin' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const updates = db.prepare(`
    SELECT tu.*, u.name AS updated_by_name
    FROM task_updates tu
    JOIN users u ON u.id = tu.updated_by
    WHERE tu.task_id = ?
    ORDER BY tu.created_at ASC
  `).all(id);

  res.json({ ...task, updates });
});

// POST /api/tasks  (admin only)
router.post('/', requireRole('admin'), (req, res) => {
  const { title, description, assigned_to, priority, due_date, location_name, location_lat, location_lng } = req.body || {};

  if (!title) return res.status(400).json({ error: 'El título es requerido' });
  if (priority && !VALID_PRIORITIES.has(priority)) {
    return res.status(400).json({ error: `Prioridad inválida. Valores: ${[...VALID_PRIORITIES].join(', ')}` });
  }
  if (assigned_to) {
    const emp = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'employee' AND active = 1").get(assigned_to);
    if (!emp) return res.status(400).json({ error: 'Empleado asignado no válido' });
  }

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, assigned_by, priority, due_date, location_name, location_lat, location_lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(), description || null, assigned_to || null, req.user.id,
    priority || 'medium', due_date || null,
    location_name || null, location_lat ?? null, location_lng ?? null
  );

  const task = db.prepare(`${SELECT_TASK} WHERE t.id = ?`).get(lastInsertRowid);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (req.user.role !== 'admin' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const { title, description, assigned_to, priority, status, due_date,
          location_name, location_lat, location_lng, note, lat, lng } = req.body || {};

  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `Estado inválido. Valores: ${[...VALID_STATUSES].join(', ')}` });
  }
  if (priority && !VALID_PRIORITIES.has(priority)) {
    return res.status(400).json({ error: `Prioridad inválida. Valores: ${[...VALID_PRIORITIES].join(', ')}` });
  }

  db.transaction(() => {
    if (req.user.role === 'admin') {
      db.prepare(`
        UPDATE tasks SET
          title         = CASE WHEN ? IS NOT NULL THEN ? ELSE title END,
          description   = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
          assigned_to   = CASE WHEN ? IS NOT NULL THEN ? ELSE assigned_to END,
          priority      = CASE WHEN ? IS NOT NULL THEN ? ELSE priority END,
          status        = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
          due_date      = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END,
          location_name = CASE WHEN ? IS NOT NULL THEN ? ELSE location_name END,
          location_lat  = CASE WHEN ? IS NOT NULL THEN ? ELSE location_lat END,
          location_lng  = CASE WHEN ? IS NOT NULL THEN ? ELSE location_lng END,
          updated_at    = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        title ?? null, title ?? null,
        description ?? null, description ?? null,
        assigned_to ?? null, assigned_to ?? null,
        priority ?? null, priority ?? null,
        status ?? null, status ?? null,
        due_date ?? null, due_date ?? null,
        location_name ?? null, location_name ?? null,
        location_lat ?? null, location_lat ?? null,
        location_lng ?? null, location_lng ?? null,
        id
      );
    } else if (status) {
      // Employees can only update status
      db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(status, id);
    }

    // Log status change
    const newStatus = status || (req.user.role === 'admin' ? null : null);
    if (newStatus && newStatus !== task.status) {
      db.prepare(
        'INSERT INTO task_updates (task_id, updated_by, status, note, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, req.user.id, newStatus, note || null, lat ?? null, lng ?? null);
    }
  })();

  res.json(db.prepare(`${SELECT_TASK} WHERE t.id = ?`).get(id));
});

// DELETE /api/tasks/:id  (admin only)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(parseInt(req.params.id, 10));
  if (result.changes === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
  res.json({ message: 'Tarea eliminada' });
});

module.exports = router;
