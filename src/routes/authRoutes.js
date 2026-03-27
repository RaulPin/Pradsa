'use strict';
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { login, changePassword, logout, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Límite estricto en endpoints de autenticación – ISO 27001:2022
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos antes de intentar nuevamente.' },
});

router.post('/login', authLimiter, login);
router.post('/change-password', requireAuth, changePassword);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

module.exports = router;
