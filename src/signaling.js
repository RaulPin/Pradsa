'use strict';
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

// db importado diferido para evitar ciclos de dependencia
let _db;
function getDb() {
  if (!_db) _db = require('./db/database');
  return _db;
}

// rooms: Map<interviewId, { interviewer: ws|null, interviewee: ws|null }>
const rooms = new Map();
const HEARTBEAT_MS = 25000;

function setupSignaling(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/signal' });

  wss.on('connection', (ws, req) => {
    ws.clientId = uuidv4();
    ws.isAlive = true;
    ws.interviewId = null;
    ws.role = null; // 'interviewer' | 'interviewee'

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      handleMessage(ws, msg, req);
    });

    ws.on('close', () => leaveRoom(ws, true));
    ws.on('error', () => leaveRoom(ws, false));
  });

  // Heartbeat – detectar clientes zombi
  const hbInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        leaveRoom(ws, false);
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_MS);

  wss.on('close', () => clearInterval(hbInterval));
  console.log('[SIGNAL] Servidor de señalización WebRTC activo en /signal');
}

// ─── Manejador de mensajes ────────────────────────────────────────────────────

function handleMessage(ws, msg, req) {
  switch (msg.type) {
    case 'join':       return handleJoin(ws, msg, req);
    case 'offer':
    case 'answer':
    case 'ice':
    case 'location_update': return relay(ws, msg);
    case 'leave':      return leaveRoom(ws, true);
    case 'end_call':   return handleEndCall(ws, msg);
    default: break;
  }
}

function handleJoin(ws, msg, req) {
  const { interviewId, authType, token } = msg;
  if (!interviewId) return send(ws, { type: 'error', message: 'interviewId requerido' });

  // Autenticación según rol
  if (authType === 'interviewer') {
    const cookie = parseCookie(req.headers.cookie, config.jwt.cookieName);
    if (!cookie) return send(ws, { type: 'error', message: 'No autenticado' });
    try {
      const payload = jwt.verify(cookie, config.jwt.secret);
      const interview = getDb().prepare('SELECT * FROM interviews WHERE id = ?').get(interviewId);
      if (!interview) return send(ws, { type: 'error', message: 'Entrevista no encontrada' });
      if (payload.role !== 'admin' && interview.scheduled_by !== payload.userId) {
        return send(ws, { type: 'error', message: 'Acceso denegado' });
      }
      ws.userId = payload.userId;
      ws.role = 'interviewer';
    } catch {
      return send(ws, { type: 'error', message: 'Sesión inválida o expirada' });
    }
  } else if (authType === 'interviewee') {
    if (!token) return send(ws, { type: 'error', message: 'Token de invitación requerido' });
    const interview = getDb()
      .prepare('SELECT * FROM interviews WHERE id = ? AND join_token = ?')
      .get(interviewId, token);
    if (!interview) return send(ws, { type: 'error', message: 'Enlace de entrevista inválido' });
    if (interview.status === 'cancelled') return send(ws, { type: 'error', message: 'Entrevista cancelada' });
    if (interview.status === 'completed') return send(ws, { type: 'error', message: 'La entrevista ya fue completada' });
    if (new Date(interview.join_token_expires_at) < new Date()) {
      return send(ws, { type: 'error', message: 'El enlace de entrevista ha expirado' });
    }
    ws.role = 'interviewee';
    ws.joinToken = token;
  } else {
    return send(ws, { type: 'error', message: 'Tipo de autenticación inválido' });
  }

  // Salir de sala anterior si existía
  if (ws.interviewId) leaveRoom(ws, false);
  ws.interviewId = interviewId;

  if (!rooms.has(interviewId)) {
    rooms.set(interviewId, { interviewer: null, interviewee: null });
  }

  const room = rooms.get(interviewId);

  // Si ya hay alguien con ese rol conectado, reemplazarlo (reconexión)
  const prev = room[ws.role];
  if (prev && prev !== ws) {
    prev.interviewId = null;
    prev.terminate();
  }
  room[ws.role] = ws;

  send(ws, { type: 'joined', role: ws.role, clientId: ws.clientId });

  // Si ambos están presentes, iniciar señalización
  const { interviewer, interviewee } = room;
  if (interviewer && interviewee) {
    // El entrevistador siempre inicia la oferta WebRTC
    send(interviewer, { type: 'peer_joined', peerId: interviewee.clientId, initiator: true });
    send(interviewee, { type: 'peer_joined', peerId: interviewer.clientId, initiator: false });

    // Marcar entrevista en progreso
    const now = new Date().toISOString();
    getDb()
      .prepare("UPDATE interviews SET status='in_progress', updated_at=? WHERE id=? AND status='scheduled'")
      .run(now, interviewId);
  }
}

function handleEndCall(ws, msg) {
  const room = rooms.get(ws.interviewId);
  const endedBy = ws.role;
  const now = new Date().toISOString();
  const db = getDb();

  // Cerrar sesión activa
  const session = db
    .prepare('SELECT * FROM interview_sessions WHERE interview_id=? AND ended_at IS NULL ORDER BY created_at DESC LIMIT 1')
    .get(ws.interviewId);

  if (session) {
    const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
    db.prepare('UPDATE interview_sessions SET ended_at=?, ended_by=?, duration_seconds=? WHERE id=?')
      .run(now, endedBy, Math.max(0, duration), session.id);
  }

  db.prepare("UPDATE interviews SET status='completed', join_token=NULL, updated_at=? WHERE id=?").run(now, ws.interviewId);

  // Notificar al par
  if (room) {
    const peer = ws.role === 'interviewer' ? room.interviewee : room.interviewer;
    if (peer) send(peer, { type: 'call_ended', by: endedBy });
  }

  leaveRoom(ws, true);
}

function relay(ws, msg) {
  const room = rooms.get(ws.interviewId);
  if (!room) return;

  const peer = ws.role === 'interviewer' ? room.interviewee : room.interviewer;
  if (peer && peer.readyState === 1) {
    send(peer, { ...msg, from: ws.clientId });
  }
}

function leaveRoom(ws, notify) {
  const { interviewId, role } = ws;
  if (!interviewId) return;

  const room = rooms.get(interviewId);
  if (room) {
    if (room[role] === ws) room[role] = null;

    // Notificar al par que alguien se fue
    if (notify) {
      const peer = role === 'interviewer' ? room.interviewee : room.interviewer;
      if (peer && peer.readyState === 1) {
        send(peer, { type: 'peer_left', role });
      }
    }

    // Limpiar sala vacía
    if (!room.interviewer && !room.interviewee) {
      rooms.delete(interviewId);
    }
  }

  ws.interviewId = null;
  ws.role = null;
}

function send(ws, data) {
  if (ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(data)); } catch { /* ignorar errores de escritura */ }
}

function parseCookie(cookieHeader = '', name) {
  const entry = (cookieHeader || '').split(';').find((c) => c.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : null;
}

module.exports = { setupSignaling };
