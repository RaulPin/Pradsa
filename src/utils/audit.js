'use strict';
const { v4: uuidv4 } = require('uuid');

// db se importa diferido para evitar dependencias circulares
let _db;
function getDb() {
  if (!_db) _db = require('../db/database');
  return _db;
}

/**
 * Registra un evento en el log de auditoría.
 * Operación síncrona – nunca debe bloquear la respuesta.
 *
 * @param {string} action  Código del evento (ej. 'LOGIN_SUCCESS')
 * @param {object} opts    { userId, details, ip, userAgent }
 */
function log(action, opts = {}) {
  const { userId, details, ip, userAgent } = opts;
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, details, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuidv4(),
        userId || null,
        action,
        details ? JSON.stringify(details) : null,
        ip || null,
        userAgent ? userAgent.substring(0, 255) : null,
        new Date().toISOString()
      );
  } catch (err) {
    console.error('[AUDIT ERROR]', err.message);
  }
}

module.exports = { log };
