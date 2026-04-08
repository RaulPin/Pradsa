'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { generateTempPassword, hashPassword } = require('../utils/password');

// Asegurar directorio de la base de datos
const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.resolve(config.dbPath));

// Pragmas de rendimiento y seguridad
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// ─── Esquema de base de datos ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    email               TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash       TEXT NOT NULL,
    role                TEXT NOT NULL DEFAULT 'user'
                          CHECK(role IN ('admin','user')),
    first_login         INTEGER NOT NULL DEFAULT 1,
    failed_attempts     INTEGER NOT NULL DEFAULT 0,
    locked_until        TEXT,
    last_login          TEXT,
    password_changed_at TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    created_by          TEXT,
    active              INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS password_history (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    action     TEXT NOT NULL,
    details    TEXT,
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

  CREATE TABLE IF NOT EXISTS interviews (
    id                    TEXT PRIMARY KEY,
    title                 TEXT NOT NULL,
    type                  TEXT NOT NULL CHECK(type IN ('pyme','fiduciario')),
    status                TEXT NOT NULL DEFAULT 'scheduled'
                            CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
    scheduled_by          TEXT NOT NULL,
    scheduled_at          TEXT NOT NULL,
    interviewee_name      TEXT NOT NULL,
    interviewee_email     TEXT NOT NULL,
    interviewee_phone     TEXT,
    interviewee_address   TEXT,
    join_token            TEXT UNIQUE,
    join_token_expires_at TEXT,
    notes                 TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    FOREIGN KEY (scheduled_by) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_interviews_user   ON interviews(scheduled_by);
  CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);
  CREATE INDEX IF NOT EXISTS idx_interviews_token  ON interviews(join_token);

  CREATE TABLE IF NOT EXISTS interview_sessions (
    id                          TEXT PRIMARY KEY,
    interview_id                TEXT NOT NULL,
    started_at                  TEXT,
    ended_at                    TEXT,
    ended_by                    TEXT,
    duration_seconds            INTEGER,
    reconnect_count             INTEGER DEFAULT 0,
    interviewee_location_lat    REAL,
    interviewee_location_lng    REAL,
    interviewee_location_address TEXT,
    interviewee_ip              TEXT,
    created_at                  TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_interview ON interview_sessions(interview_id);

  CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    session_id  TEXT,
    filename    TEXT NOT NULL,
    captured_by TEXT NOT NULL CHECK(captured_by IN ('interviewer','interviewee')),
    captured_at TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
  );
  CREATE INDEX IF NOT EXISTS idx_photos_interview ON photos(interview_id);

  CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id           TEXT PRIMARY KEY,
    interview_id TEXT NOT NULL,
    form_type    TEXT NOT NULL CHECK(form_type IN ('pyme','fiduciario')),
    responses    TEXT NOT NULL DEFAULT '{}',
    completed    INTEGER DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    FOREIGN KEY (interview_id) REFERENCES interviews(id)
  );
`);

// ─── Migraciones ─────────────────────────────────────────────────────────────
// Agregar columna folio si no existe (migración no destructiva)
try { db.exec('ALTER TABLE interviews ADD COLUMN folio TEXT'); } catch { /* ya existe */ }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_interviews_folio ON interviews(folio) WHERE folio IS NOT NULL'); } catch { /* ya existe */ }

// ─── Inicialización del administrador ────────────────────────────────────────
(async () => {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return;

  const tempPass = generateTempPassword();
  const hash = await hashPassword(tempPass);
  const now = new Date().toISOString();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, first_login, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)
  `).run(id, config.admin.name, config.admin.email, hash, now, now);

  db.prepare(`
    INSERT INTO password_history (id, user_id, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), id, hash, now);

  console.log('\n' + '═'.repeat(55));
  console.log('  ADMINISTRADOR INICIAL CREADO');
  console.log('  Email:      ' + config.admin.email);
  console.log('  Contraseña: ' + tempPass);
  console.log('  ⚠️  Cámbiala en el primer ingreso');
  console.log('═'.repeat(55) + '\n');
})().catch(console.error);

module.exports = db;
