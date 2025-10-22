const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const sanitizedPath = path.normalize(req.url.split('?')[0]).replace(/^\.\./, '');
  let filePath = path.join(PUBLIC_DIR, sanitizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
      res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let nextClientId = 1;
const rooms = new Map();

server.on('upgrade', (req, socket) => {
  if (req.headers['upgrade'] !== 'websocket') {
    socket.destroy();
    return;
  }

  if (!req.url.startsWith('/signal')) {
    socket.destroy();
    return;
  }

  const acceptKey = req.headers['sec-websocket-key'];
  if (!acceptKey) {
    socket.destroy();
    return;
  }

  const hash = crypto.createHash('sha1').update(acceptKey + GUID).digest('base64');
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
  ];

  socket.write(responseHeaders.concat('\r\n').join('\r\n'));

  const client = {
    id: `client-${nextClientId++}`,
    socket,
    roomId: null,
    buffer: Buffer.alloc(0),
    location: null,
  };

  socket.on('data', (chunk) => handleFrameData(client, chunk));
  socket.on('close', () => removeClient(client));
  socket.on('end', () => removeClient(client));
  socket.on('error', () => removeClient(client));
});

function handleFrameData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const fin = Boolean(firstByte & 0x80);
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (!fin) {
      closeSocket(client.socket, 1003);
      return;
    }

    if (payloadLength === 126) {
      if (client.buffer.length < offset + 2) {
        return;
      }
      payloadLength = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      if (client.buffer.length < offset + 8) {
        return;
      }
      const high = client.buffer.readUInt32BE(offset);
      const low = client.buffer.readUInt32BE(offset + 4);
      if (high !== 0) {
        closeSocket(client.socket, 1009);
        return;
      }
      payloadLength = low;
      offset += 8;
    }

    if (!masked) {
      closeSocket(client.socket, 1002);
      return;
    }

    if (client.buffer.length < offset + 4) {
      return;
    }

    const mask = client.buffer.slice(offset, offset + 4);
    offset += 4;

    if (client.buffer.length < offset + payloadLength) {
      return;
    }

    const payload = client.buffer.slice(offset, offset + payloadLength);
    const unmasked = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i += 1) {
      unmasked[i] = payload[i] ^ mask[i % 4];
    }

    client.buffer = client.buffer.slice(offset + payloadLength);

    if (opcode === 0x1) {
      const text = unmasked.toString('utf8');
      handleClientMessage(client, text);
    } else if (opcode === 0x8) {
      closeSocket(client.socket, 1000, false);
      return;
    } else if (opcode === 0x9) {
      // ping
      sendFrame(client.socket, unmasked, 0xA);
    } else {
      closeSocket(client.socket, 1003);
      return;
    }
  }
}

function buildFrame(payload, opcode = 0x1) {
  const payloadLength = payload.length;
  let frame;

  if (payloadLength < 126) {
    frame = Buffer.alloc(2 + payloadLength);
    frame[0] = 0x80 | opcode;
    frame[1] = payloadLength;
    payload.copy(frame, 2);
  } else if (payloadLength < 65536) {
    frame = Buffer.alloc(4 + payloadLength);
    frame[0] = 0x80 | opcode;
    frame[1] = 126;
    frame.writeUInt16BE(payloadLength, 2);
    payload.copy(frame, 4);
  } else {
    frame = Buffer.alloc(10 + payloadLength);
    frame[0] = 0x80 | opcode;
    frame[1] = 127;
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payloadLength, 6);
    payload.copy(frame, 10);
  }

  return frame;
}

function sendFrame(socket, data, opcode = 0x1) {
  if (socket.destroyed) {
    return;
  }
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const frame = buildFrame(payload, opcode);
  socket.write(frame);
}

function closeSocket(socket, code = 1000, notify = true) {
  if (socket.destroyed) {
    return;
  }
  if (notify) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16BE(code, 0);
    const frame = buildFrame(buffer, 0x8);
    socket.end(frame);
  } else {
    socket.end();
  }
}

function handleClientMessage(client, text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    return;
  }

  switch (payload.type) {
    case 'join':
      handleJoin(client, payload);
      break;
    case 'offer':
    case 'answer':
    case 'ice':
    case 'leave':
      forwardToPeer(client, payload);
      if (payload.type === 'leave') {
        removeClient(client);
      }
      break;
    case 'location_update':
      handleLocationUpdate(client, payload);
      break;
    default:
      break;
  }
}

function handleJoin(client, payload) {
  const { roomId } = payload;
  if (!roomId || typeof roomId !== 'string') {
    send(client, { type: 'error', message: 'Invalid room identifier.' });
    return;
  }

  if (client.roomId) {
    send(client, { type: 'error', message: 'Client already joined a room.' });
    return;
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, []);
  }

  const room = rooms.get(roomId);
  if (room.length >= 2) {
    send(client, { type: 'room_full' });
    return;
  }

  client.roomId = roomId;
  client.location = sanitizeLocation(payload.location);
  room.push(client);

  send(client, { type: 'joined', clientId: client.id });
  send(client, { type: 'location_ack', location: client.location });

  if (room.length === 2) {
    const [first, second] = room;
    send(first, { type: 'ready', initiator: true, peerId: second.id });
    send(second, { type: 'ready', initiator: false, peerId: first.id });
    if (second.location) {
      send(first, { type: 'location_update', location: second.location, peerId: second.id });
    }
    if (first.location) {
      send(second, { type: 'location_update', location: first.location, peerId: first.id });
    }
  }
}

function forwardToPeer(client, payload) {
  const { roomId } = client;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  room.forEach((participant) => {
    if (participant !== client) {
      send(participant, { ...payload, from: client.id });
    }
  });
}

function handleLocationUpdate(client, payload) {
  const sanitized = sanitizeLocation(payload.location);
  client.location = sanitized;
  send(client, { type: 'location_ack', location: client.location });
  if (sanitized) {
    forwardToPeer(client, { type: 'location_update', location: sanitized });
  }
}

function removeClient(client) {
  const { roomId } = client;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const idx = room.indexOf(client);
  if (idx !== -1) {
    room.splice(idx, 1);
  }

  if (room.length === 0) {
    rooms.delete(roomId);
  } else {
    room.forEach((participant) => {
      send(participant, { type: 'peer_left', peerId: client.id });
    });
  }

  client.roomId = null;
  client.location = null;
}

function send(client, payload) {
  if (!client || !payload) {
    return;
  }
  try {
    sendFrame(client.socket, JSON.stringify(payload), 0x1);
  } catch (err) {
    // ignore write errors
  }
}

function sanitizeLocation(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const { latitude, longitude, accuracy, timestamp } = raw;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  const location = {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };

  if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
    location.accuracy = Math.max(0, Number(accuracy));
  }

  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    location.timestamp = Number(timestamp);
  }

  return location;
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
