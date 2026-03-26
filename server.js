'use strict';

require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const http    = require('http');
const { WebSocketServer } = require('ws');
const crypto  = require('crypto');

const app    = express();
const server = http.createServer(app);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      mediaSrc:   ["'self'", 'blob:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes. Intente en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/interviews', require('./routes/interviews'));
app.use('/api/session',    require('./routes/session'));

// ── Static files ──────────────────────────────────────────────────────────────
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC, { index: false }));

const pages = ['login', 'dashboard', 'admin', 'interview', 'guest'];
pages.forEach(p => {
  app.get(`/${p}`, (req, res) => res.sendFile(path.join(PUBLIC, `${p}.html`)));
  app.get(`/${p}.html`, (req, res) => res.sendFile(path.join(PUBLIC, `${p}.html`)));
});

app.get('/', (req, res) => res.redirect('/login'));

app.use((req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor.' });
});

// ── WebSocket Signaling ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });

/** rooms: Map<roomCode, Set<{ws, role, peerId}>> */
const rooms = new Map();
const ROOM_TTL_MS = 30 * 60 * 1000;

function getRoomCode(ws) {
  for (const [code, members] of rooms) {
    for (const m of members) { if (m.ws === ws) return code; }
  }
  return null;
}

function broadcast(roomCode, data, excludeWs = null) {
  const members = rooms.get(roomCode);
  if (!members) return;
  const msg = JSON.stringify(data);
  for (const m of members) {
    if (m.ws !== excludeWs && m.ws.readyState === m.ws.OPEN) m.ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'join': {
        const { roomCode, role } = msg;
        if (!roomCode || !role) return;
        if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
        const members = rooms.get(roomCode);
        if (members.size >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala llena.' }));
          return;
        }
        const peerId = crypto.randomBytes(4).toString('hex');
        members.add({ ws, role, peerId });
        ws.send(JSON.stringify({ type: 'joined', roomCode, peerId, membersCount: members.size }));
        if (members.size === 2) {
          for (const m of members) {
            m.ws.send(JSON.stringify({ type: 'ready', initiator: m.role === 'interviewer' }));
          }
        }
        break;
      }
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        broadcast(getRoomCode(ws), msg, ws);
        break;

      case 'leave':
        handleLeave(ws);
        break;

      case 'reconnect': {
        const { roomCode, role } = msg;
        if (!roomCode) return;
        if (!rooms.has(roomCode)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sesión expirada.' }));
          return;
        }
        const members = rooms.get(roomCode);
        for (const m of [...members]) {
          if (m.role === role && m.ws.readyState !== m.ws.OPEN) members.delete(m);
        }
        if (members.size >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala llena.' }));
          return;
        }
        const peerId = crypto.randomBytes(4).toString('hex');
        members.add({ ws, role, peerId });
        ws.send(JSON.stringify({ type: 'joined', roomCode, peerId, membersCount: members.size, reconnected: true }));
        broadcast(roomCode, { type: 'peer-reconnected', role }, ws);
        if (members.size === 2) {
          for (const m of members) {
            m.ws.send(JSON.stringify({ type: 'ready', initiator: m.role === 'interviewer', reconnect: true }));
          }
        }
        break;
      }

      case 'chat': {
        const roomCode = getRoomCode(ws);
        if (roomCode) broadcast(roomCode, { type: 'chat', text: msg.text, from: msg.from }, ws);
        break;
      }

      default: break;
    }
  });

  ws.on('close', () => handleLeave(ws));
  ws.on('error', (err) => { console.error('[WS ERROR]', err.message); handleLeave(ws); });
});

function handleLeave(ws) {
  const roomCode = getRoomCode(ws);
  if (!roomCode) return;
  const members = rooms.get(roomCode);
  if (!members) return;
  let leavingRole = null;
  for (const m of members) {
    if (m.ws === ws) { leavingRole = m.role; members.delete(m); break; }
  }
  broadcast(roomCode, { type: 'peer-left', role: leavingRole });
  if (members.size === 0) {
    setTimeout(() => { if (rooms.get(roomCode)?.size === 0) rooms.delete(roomCode); }, ROOM_TTL_MS);
  }
}

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\nPradsa Virtual corriendo en http://localhost:${PORT}\n`);
});
