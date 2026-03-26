'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'pradsa.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'employee',
    phone         TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS employees (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    position       TEXT,
    department     TEXT,
    hire_date      DATE,
    employee_code  TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT,
    assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_by   INTEGER NOT NULL REFERENCES users(id),
    priority      TEXT    NOT NULL DEFAULT 'medium',
    status        TEXT    NOT NULL DEFAULT 'pending',
    due_date      DATETIME,
    location_name TEXT,
    location_lat  REAL,
    location_lng  REAL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS task_updates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    updated_by  INTEGER NOT NULL REFERENCES users(id),
    status      TEXT    NOT NULL,
    note        TEXT,
    lat         REAL,
    lng         REAL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id      INTEGER NOT NULL REFERENCES users(id),
    date             DATE    NOT NULL,
    clock_in         DATETIME,
    clock_out        DATETIME,
    clock_in_lat     REAL,
    clock_in_lng     REAL,
    clock_out_lat    REAL,
    clock_out_lng    REAL,
    notes            TEXT,
    UNIQUE(employee_id, date)
  );

  CREATE TABLE IF NOT EXISTS employee_locations (
    employee_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lat          REAL    NOT NULL,
    lng          REAL    NOT NULL,
    accuracy     REAL,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS location_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lat          REAL    NOT NULL,
    lng          REAL    NOT NULL,
    accuracy     REAL,
    recorded_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_loc_history_emp_date
    ON location_history(employee_id, recorded_at);
`);

// ── Migrations ────────────────────────────────────────────────────────────────
// Add must_change_password flag (ISO 27001:2022 — forced change on first login)
try {
  db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists — safe to ignore */ }

// Seed default admin user if none exists
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')")
    .run('admin@pradsa.com', hash, 'Administrador');
  console.log('✓ Admin por defecto creado: admin@pradsa.com / admin123');
}

module.exports = db;
