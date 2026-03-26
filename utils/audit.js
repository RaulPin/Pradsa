'use strict';

const { v4: uuidv4 } = require('uuid');

let _db = null;
const getDb = () => {
  if (!_db) _db = require('../db/database');
  return _db;
};

/**
 * Log an audit event.
 * @param {object} opts
 * @param {string|null} opts.userId
 * @param {string} opts.action
 * @param {string} [opts.resource]
 * @param {object|string} [opts.details]
 * @param {string} [opts.ip]
 * @param {string} [opts.userAgent]
 */
function audit({ userId = null, action, resource = null, details = null, ip = null, userAgent = null }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      userId,
      action,
      resource,
      details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
      ip,
      userAgent
    );
  } catch (err) {
    console.error('[AUDIT ERROR]', err.message);
  }
}

module.exports = { audit };
