'use strict';

const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'pradsa_dev_secret_change_in_production';
const JWT_EXPIRES_IN = '8h';

function auth(req, res, next) {
  const header = req.headers.authorization;
  // Also accept token via ?_token= query param (for image src URLs)
  const rawToken = (header && header.startsWith('Bearer '))
    ? header.slice(7)
    : req.query._token || null;

  if (!rawToken) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const token = rawToken;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare('SELECT id, email, name, role, active FROM users WHERE id = ?')
      .get(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permisos insuficientes' });
    }
    next();
  };
}

module.exports = { auth, requireRole, JWT_SECRET, JWT_EXPIRES_IN };
