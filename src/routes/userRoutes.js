'use strict';
const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  createUser, listUsers, getUser, updateUser, unlockUser, getAuditLogs,
} = require('../controllers/userController');

const router = Router();

// Todas las rutas de usuarios requieren autenticación y rol admin
router.use(requireAuth, requireAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.get('/audit-logs', getAuditLogs);
router.get('/:id', getUser);
router.patch('/:id', updateUser);
router.post('/:id/unlock', unlockUser);

module.exports = router;
