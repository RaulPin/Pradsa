'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { generateFiduciarioReport } = require('../controllers/reportController');

const router = Router();

router.get('/fiduciario/:id', requireAuth, generateFiduciarioReport);

module.exports = router;
