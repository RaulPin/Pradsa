'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Middleware: requiere sesión activa.
 * El JWT viaja en una cookie httpOnly llamada ep_session.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.[config.jwt.cookieName];

  if (!token) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    return res.redirect('/login');
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = payload;

    // Si es primer login y no está cambiando contraseña, bloquear
    if (payload.firstLogin && req.path !== '/api/auth/change-password' && req.path !== '/api/auth/me') {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Debes cambiar tu contraseña antes de continuar', code: 'FIRST_LOGIN' });
      }
    }

    next();
  } catch {
    res.clearCookie(config.jwt.cookieName);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Sesión expirada, inicia sesión nuevamente' });
    }
    res.redirect('/login');
  }
}

/**
 * Middleware: requiere rol específico.
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Acceso denegado: permisos insuficientes' });
    }
    next();
  };
}

const requireAdmin = requireRole('admin');

module.exports = { requireAuth, requireRole, requireAdmin };
