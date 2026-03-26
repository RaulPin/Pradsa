'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[WARN] JWT_SECRET not set – using random ephemeral key (tokens invalidated on restart)');
  return crypto.randomBytes(64).toString('hex');
})();

const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, algorithm: 'HS256' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

/** Extract token from Authorization header or cookie */
function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

/** Middleware: require valid JWT */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'No autenticado.' });

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

/** Middleware: require admin role */
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol administrador.' });
    }
    next();
  });
}

/** Middleware: block if must_change_password (except on /api/auth/change-password) */
function blockIfMustChange(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({
      error: 'Debe cambiar su contraseña antes de continuar.',
      mustChangePassword: true,
    });
  }
  next();
}

module.exports = { signToken, verifyToken, requireAuth, requireAdmin, blockIfMustChange };
