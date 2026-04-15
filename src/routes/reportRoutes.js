'use strict';
const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { generateFiduciarioReport, generatePymeReport } = require('../controllers/reportController');
const { downloadKpiExcel } = require('../controllers/kpiController');

const router = Router();

router.get('/fiduciario/:id', requireAuth, generateFiduciarioReport);
router.get('/pyme/:id',       requireAuth, generatePymeReport);
router.get('/kpi/excel',      requireAuth, requireAdmin, downloadKpiExcel);

module.exports = router;
