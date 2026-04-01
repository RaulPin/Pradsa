'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { generateFiduciarioReport, generatePymeReport } = require('../controllers/reportController');

const router = Router();

router.get('/fiduciario/:id', requireAuth, generateFiduciarioReport);
router.get('/pyme/:id',       requireAuth, generatePymeReport);

module.exports = router;
