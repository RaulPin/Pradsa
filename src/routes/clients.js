'use strict';

const express = require('express');
const db = require('../database');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

const SELECT_CLIENT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM client_addresses a WHERE a.client_id = c.id) AS address_count
  FROM clients c
`;

// ── GET /api/clients ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { q, active } = req.query;
  let query = SELECT_CLIENT + ' WHERE 1=1';
  const params = [];
  if (active !== undefined) { query += ' AND c.active = ?'; params.push(active === '0' ? 0 : 1); }
  else { query += ' AND c.active = 1'; }
  if (q) {
    query += ' AND (c.razon_social LIKE ? OR c.nombre_comercial LIKE ? OR c.rfc LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  query += ' ORDER BY c.razon_social ASC';
  res.json(db.prepare(query).all(...params));
});

// ── GET /api/clients/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const client = db.prepare(`${SELECT_CLIENT} WHERE c.id = ?`).get(id);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  const addresses = db.prepare('SELECT * FROM client_addresses WHERE client_id = ? ORDER BY id ASC').all(id);
  res.json({ ...client, addresses });
});

// ── POST /api/clients ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    razon_social, rfc, regimen_fiscal,
    fiscal_calle, fiscal_num_ext, fiscal_num_int, fiscal_colonia,
    fiscal_ciudad, fiscal_estado, fiscal_cp, fiscal_pais,
    nombre_comercial, contacto_nombre, contacto_telefono, contacto_email, notas,
  } = req.body || {};

  if (!razon_social?.trim()) return res.status(400).json({ error: 'La razón social es requerida' });

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO clients (
      razon_social, rfc, regimen_fiscal,
      fiscal_calle, fiscal_num_ext, fiscal_num_int, fiscal_colonia,
      fiscal_ciudad, fiscal_estado, fiscal_cp, fiscal_pais,
      nombre_comercial, contacto_nombre, contacto_telefono, contacto_email, notas
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    razon_social.trim(), rfc?.trim()||null, regimen_fiscal?.trim()||null,
    fiscal_calle||null, fiscal_num_ext||null, fiscal_num_int||null, fiscal_colonia||null,
    fiscal_ciudad||null, fiscal_estado||null, fiscal_cp||null, fiscal_pais||'México',
    nombre_comercial||null, contacto_nombre||null, contacto_telefono||null, contacto_email||null, notas||null
  );

  res.status(201).json(db.prepare(`${SELECT_CLIENT} WHERE c.id = ?`).get(lastInsertRowid));
});

// ── PUT /api/clients/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }

  const FIELDS = [
    'razon_social','rfc','regimen_fiscal',
    'fiscal_calle','fiscal_num_ext','fiscal_num_int','fiscal_colonia',
    'fiscal_ciudad','fiscal_estado','fiscal_cp','fiscal_pais',
    'nombre_comercial','contacto_nombre','contacto_telefono','contacto_email','notas','active',
  ];
  const body = req.body || {};
  const sets = []; const vals = [];
  for (const f of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      sets.push(`${f} = ?`); vals.push(body[f] ?? null);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  sets.push('updated_at = CURRENT_TIMESTAMP');
  vals.push(id);
  db.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  const client = db.prepare(`${SELECT_CLIENT} WHERE c.id = ?`).get(id);
  const addresses = db.prepare('SELECT * FROM client_addresses WHERE client_id = ? ORDER BY id ASC').all(id);
  res.json({ ...client, addresses });
});

// ── DELETE /api/clients/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = db.prepare('UPDATE clients SET active = 0 WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ message: 'Cliente desactivado' });
});

// ══ Addresses ════════════════════════════════════════════════════════════════

// GET /api/clients/:id/addresses
router.get('/:id/addresses', (req, res) => {
  const id = parseInt(req.params.id, 10);
  res.json(db.prepare('SELECT * FROM client_addresses WHERE client_id = ? ORDER BY id ASC').all(id));
});

// POST /api/clients/:id/addresses
router.post('/:id/addresses', (req, res) => {
  const clientId = parseInt(req.params.id, 10);
  if (!db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId)) {
    return res.status(404).json({ error: 'Cliente no encontrado' });
  }
  const { alias, calle, num_ext, num_int, colonia, ciudad, estado, cp, pais, referencias, lat, lng } = req.body || {};
  if (!alias?.trim()) return res.status(400).json({ error: 'El alias de la dirección es requerido' });

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO client_addresses (client_id, alias, calle, num_ext, num_int, colonia, ciudad, estado, cp, pais, referencias, lat, lng)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(clientId, alias.trim(), calle||null, num_ext||null, num_int||null, colonia||null, ciudad||null, estado||null, cp||null, pais||'México', referencias||null, lat??null, lng??null);

  res.status(201).json(db.prepare('SELECT * FROM client_addresses WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/clients/:id/addresses/:addrId
router.put('/:id/addresses/:addrId', (req, res) => {
  const addrId = parseInt(req.params.addrId, 10);
  if (!db.prepare('SELECT id FROM client_addresses WHERE id = ? AND client_id = ?').get(addrId, parseInt(req.params.id, 10))) {
    return res.status(404).json({ error: 'Dirección no encontrada' });
  }
  const FIELDS = ['alias','calle','num_ext','num_int','colonia','ciudad','estado','cp','pais','referencias','lat','lng'];
  const body = req.body || {};
  const sets = []; const vals = [];
  for (const f of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, f)) { sets.push(`${f} = ?`); vals.push(body[f] ?? null); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos para actualizar' });
  vals.push(addrId);
  db.prepare(`UPDATE client_addresses SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM client_addresses WHERE id = ?').get(addrId));
});

// DELETE /api/clients/:id/addresses/:addrId
router.delete('/:id/addresses/:addrId', (req, res) => {
  const addrId = parseInt(req.params.addrId, 10);
  const result = db.prepare('DELETE FROM client_addresses WHERE id = ? AND client_id = ?').run(addrId, parseInt(req.params.id, 10));
  if (result.changes === 0) return res.status(404).json({ error: 'Dirección no encontrada' });
  res.json({ message: 'Dirección eliminada' });
});

module.exports = router;
