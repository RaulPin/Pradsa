'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'pradsa.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('admin','user')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    failed_attempts  INTEGER NOT NULL DEFAULT 0,
    locked_until     TEXT,
    last_login       TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_history (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS interviews (
    id                TEXT PRIMARY KEY,
    interviewer_id    TEXT NOT NULL REFERENCES users(id),
    interview_type    TEXT NOT NULL CHECK(interview_type IN ('pyme','fiduciario')),
    status            TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK(status IN ('scheduled','waiting','in_progress','completed','cancelled')),
    interviewee_name  TEXT NOT NULL,
    interviewee_id_doc TEXT NOT NULL,
    interviewee_email TEXT,
    interviewee_phone TEXT,
    declared_address  TEXT NOT NULL,
    scheduled_at      TEXT NOT NULL,
    started_at        TEXT,
    ended_at          TEXT,
    room_code         TEXT UNIQUE NOT NULL,
    guest_token       TEXT UNIQUE NOT NULL,
    location_lat      REAL,
    location_lon      REAL,
    location_verified INTEGER NOT NULL DEFAULT 0,
    location_distance_m REAL,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS interview_photos (
    id           TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    captured_by  TEXT NOT NULL CHECK(captured_by IN ('interviewer','guest')),
    captured_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id           TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    section      TEXT NOT NULL,
    question_key TEXT NOT NULL,
    question_text TEXT NOT NULL,
    answer       TEXT,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(interview_id, question_key)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT REFERENCES users(id),
    action     TEXT NOT NULL,
    resource   TEXT,
    details    TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Seed default admin ────────────────────────────────────────────────────────
const existingAdmin = db.prepare('SELECT id FROM users WHERE role=? LIMIT 1').get('admin');
if (!existingAdmin) {
  const { v4: uuidv4 } = require('uuid');
  const bcrypt = require('bcryptjs');
  const { generatePassword } = require('../utils/password');

  const adminId = uuidv4();
  const tempPass = generatePassword();
  const hash = bcrypt.hashSync(tempPass, 12);

  db.prepare(`INSERT INTO users (id,username,email,full_name,password_hash,role,must_change_password)
    VALUES (?,?,?,?,?,?,1)`)
    .run(adminId, 'admin', 'admin@pradsa.local', 'Administrador del Sistema', hash, 'admin');

  db.prepare(`INSERT INTO password_history (id,user_id,password_hash) VALUES (?,?,?)`)
    .run(uuidv4(), adminId, hash);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        PRADSA VIRTUAL – ACCESO INICIAL       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Usuario:    admin                           ║`);
  console.log(`║  Contraseña: ${tempPass.padEnd(30)}║`);
  console.log('║  ** Cambiar en primer inicio de sesión **    ║');
  console.log('╚══════════════════════════════════════════════╝\n');
}

module.exports = db;
