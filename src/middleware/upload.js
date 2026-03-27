'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    // req.params.id debe estar disponible (seteado por ruta o middleware previo)
    const interviewId = req.params.id || 'unknown';
    const dir = path.join(path.resolve(config.uploadDir), interviewId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, _file, cb) {
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}.jpg`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Solo se permiten archivos de imagen'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;
