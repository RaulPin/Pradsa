'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { generateFiduciarioWord, generatePymeWord } = require('../controllers/wordController');

const router = Router();

router.get('/fiduciario/:id', requireAuth, generateFiduciarioWord);
router.get('/pyme/:id',       requireAuth, generatePymeWord);

module.exports = router;
