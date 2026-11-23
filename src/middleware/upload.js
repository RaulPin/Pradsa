'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// ─── Fotos (5 MB, imágenes) ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, _file, cb) {
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

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Grabaciones de video (500 MB, video/webm) ────────────────────────────────
const recordingStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const interviewId = req.params.id || 'unknown';
    const dir = path.join(path.resolve(config.uploadDir), '..', 'recordings', interviewId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, _file, cb) {
    cb(null, `recording-${Date.now()}.webm`);
  },
});

const recordingFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith('video/')) {
    return cb(new Error('Solo se permiten archivos de video'), false);
  }
  cb(null, true);
};

const uploadRecording = multer({
  storage: recordingStorage,
  fileFilter: recordingFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

module.exports = upload;
module.exports.recording = uploadRecording;
