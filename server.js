'use strict';

const express = require('express');
const http    = require('http');
const path    = require('path');
const crypto  = require('crypto');

// Initialize DB (creates schema + seeds admin on first run)
require('./src/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/employees',  require('./src/routes/employees'));
app.use('/api/tasks',      require('./src/routes/tasks'));
app.use('/api/attendance', require('./src/routes/attendance'));
app.use('/api/location',   require('./src/routes/location'));

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Serve SPA for all non-API routes
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(app);

// ── Legacy WebRTC Signaling (WebSocket on /signal) ────────────────────────────
// Keeps the existing 1-on-1 interview app functional
const GUID         = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let   nextClientId = 1;
const rooms        = new Map();

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] !== 'websocket' || !req.url.startsWith('/signal')) {
    socket.destroy();
    return;
  }

  const acceptKey = req.headers['sec-websocket-key'];
  if (!acceptKey) { socket.destroy(); return; }

  const hash = crypto.createHash('sha1').update(acceptKey + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${hash}\r\n\r\n`
  );

  const client = {
    id: `client-${nextClientId++}`,
    socket,
    roomId: null,
    buffer: Buffer.alloc(0),
    location: null,
  };

  socket.on('data',  (chunk) => handleFrameData(client, chunk));
  socket.on('close', ()      => removeClient(client));
  socket.on('end',   ()      => removeClient(client));
  socket.on('error', ()      => removeClient(client));
});

function handleFrameData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const b0 = client.buffer[0];
    const b1 = client.buffer[1];
    const fin    = Boolean(b0 & 0x80);
    const opcode = b0 & 0x0f;
    const masked = Boolean(b1 & 0x80);
    let   payloadLen = b1 & 0x7f;
    let   offset = 2;

    if (!fin) { closeSocket(client.socket, 1003); return; }

    if (payloadLen === 126) {
      if (client.buffer.length < offset + 2) return;
      payloadLen = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (client.buffer.length < offset + 8) return;
      if (client.buffer.readUInt32BE(offset) !== 0) { closeSocket(client.socket, 1009); return; }
      payloadLen = client.buffer.readUInt32BE(offset + 4);
      offset += 8;
    }

    if (!masked) { closeSocket(client.socket, 1002); return; }
    if (client.buffer.length < offset + 4 + payloadLen) return;

    const mask    = client.buffer.slice(offset, offset + 4);
    offset += 4;
    const payload = client.buffer.slice(offset, offset + payloadLen);
    const decoded = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) decoded[i] = payload[i] ^ mask[i % 4];
    client.buffer = client.buffer.slice(offset + payloadLen);

    if      (opcode === 0x1) handleClientMessage(client, decoded.toString('utf8'));
    else if (opcode === 0x8) { closeSocket(client.socket, 1000, false); return; }
    else if (opcode === 0x9) sendFrame(client.socket, decoded, 0xA); // pong
    else                     { closeSocket(client.socket, 1003); return; }
  }
}

function buildFrame(payload, opcode = 0x1) {
  const len = payload.length;
  let frame;
  if (len < 126) {
    frame = Buffer.alloc(2 + len);
    frame[0] = 0x80 | opcode; frame[1] = len;
    payload.copy(frame, 2);
  } else if (len < 65536) {
    frame = Buffer.alloc(4 + len);
    frame[0] = 0x80 | opcode; frame[1] = 126;
    frame.writeUInt16BE(len, 2); payload.copy(frame, 4);
  } else {
    frame = Buffer.alloc(10 + len);
    frame[0] = 0x80 | opcode; frame[1] = 127;
    frame.writeUInt32BE(0, 2); frame.writeUInt32BE(len, 6);
    payload.copy(frame, 10);
  }
  return frame;
}

function sendFrame(socket, data, opcode = 0x1) {
  if (socket.destroyed) return;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  socket.write(buildFrame(buf, opcode));
}

function closeSocket(socket, code = 1000, notify = true) {
  if (socket.destroyed) return;
  if (notify) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code, 0);
    socket.end(buildFrame(b, 0x8));
  } else {
    socket.end();
  }
}

function handleClientMessage(client, text) {
  let payload;
  try { payload = JSON.parse(text); } catch { return; }

  switch (payload.type) {
    case 'join':     handleJoin(client, payload); break;
    case 'offer':
    case 'answer':
    case 'ice':
    case 'leave':
      forwardToPeer(client, payload);
      if (payload.type === 'leave') removeClient(client);
      break;
    case 'location_update': handleLocationUpdate(client, payload); break;
  }
}

function handleJoin(client, payload) {
  const { roomId } = payload;
  if (!roomId || typeof roomId !== 'string') {
    send(client, { type: 'error', message: 'Identificador de sala inválido.' });
    return;
  }
  if (client.roomId) { send(client, { type: 'error', message: 'Ya estás en una sala.' }); return; }
  if (!rooms.has(roomId)) rooms.set(roomId, []);

  const room = rooms.get(roomId);
  if (room.length >= 2) { send(client, { type: 'room_full' }); return; }

  client.roomId  = roomId;
  client.location = sanitizeLocation(payload.location);
  room.push(client);
  send(client, { type: 'joined', clientId: client.id });
  send(client, { type: 'location_ack', location: client.location });

  if (room.length === 2) {
    const [first, second] = room;
    send(first,  { type: 'ready', initiator: true,  peerId: second.id });
    send(second, { type: 'ready', initiator: false, peerId: first.id  });
    if (second.location) send(first,  { type: 'location_update', location: second.location, peerId: second.id });
    if (first.location)  send(second, { type: 'location_update', location: first.location,  peerId: first.id  });
  }
}

function forwardToPeer(client, payload) {
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.forEach(p => { if (p !== client) send(p, { ...payload, from: client.id }); });
}

function handleLocationUpdate(client, payload) {
  const sanitized = sanitizeLocation(payload.location);
  client.location = sanitized;
  send(client, { type: 'location_ack', location: sanitized });
  if (sanitized) forwardToPeer(client, { type: 'location_update', location: sanitized });
}

function removeClient(client) {
  const room = rooms.get(client.roomId);
  if (!room) return;
  const idx = room.indexOf(client);
  if (idx !== -1) room.splice(idx, 1);
  if (room.length === 0) rooms.delete(client.roomId);
  else room.forEach(p => send(p, { type: 'peer_left', peerId: client.id }));
  client.roomId   = null;
  client.location = null;
}

function send(client, payload) {
  try { sendFrame(client.socket, JSON.stringify(payload)); } catch { /* ignore */ }
}

function sanitizeLocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { latitude, longitude, accuracy, timestamp } = raw;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  const loc = { latitude: Number(latitude), longitude: Number(longitude) };
  if (typeof accuracy  === 'number' && Number.isFinite(accuracy))  loc.accuracy  = Math.max(0, accuracy);
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) loc.timestamp = timestamp;
  return loc;
}

// ─────────────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Pradsa corriendo en http://localhost:${PORT}`);
});
