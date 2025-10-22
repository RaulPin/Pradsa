const joinForm = document.getElementById('join-form');
const roomInput = document.getElementById('room-id');
const statusEl = document.getElementById('status');
const sessionSection = document.getElementById('session');
const callSection = document.getElementById('call');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteLabel = document.getElementById('remote-label');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');
const shareScreenBtn = document.getElementById('share-screen');
const leaveBtn = document.getElementById('leave');
const timerEl = document.getElementById('timer');
const qualityEl = document.getElementById('quality');
const localLocationEl = document.getElementById('local-location');
const remoteLocationEl = document.getElementById('remote-location');
const distanceEl = document.getElementById('distance');

let ws;
let peerConnection;
let localStream;
let screenStream;
let callStart;
let timerInterval;
let qualityInterval;
let isInitiator = false;
let lastVideoStats;
let clientId;
let localLocation;
let remoteLocation;
let geolocationWatchId = null;
let lastLocationSent = null;
let lastLocationSentAt = 0;
let lastGeolocationErrorMessage = null;

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const hasGeolocationSupport = 'geolocation' in navigator;
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 5000,
};

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const roomId = roomInput.value.trim();
  if (!roomId) {
    updateStatus('Introduce un identificador de sala.');
    return;
  }
  try {
    await startSession(roomId);
  } catch (error) {
    console.error(error);
    updateStatus('No se pudo iniciar la sesión. Verifica los permisos de cámara/micrófono.');
  }
});

toggleAudioBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  toggleAudioBtn.textContent = audioTrack.enabled ? 'Silenciar audio' : 'Activar audio';
});

toggleVideoBtn.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  toggleVideoBtn.textContent = videoTrack.enabled ? 'Pausar video' : 'Activar video';
});

shareScreenBtn.addEventListener('click', async () => {
  if (!peerConnection) return;
  if (screenStream) {
    stopScreenShare();
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video');
    if (sender && screenTrack) {
      await sender.replaceTrack(screenTrack);
      remoteLabel.textContent = 'Compartiendo pantalla';
      shareScreenBtn.textContent = 'Detener pantalla';
      screenTrack.onended = () => stopScreenShare();
    }
  } catch (error) {
    console.error('Error compartiendo pantalla', error);
    updateStatus('No se pudo compartir la pantalla.');
  }
});

leaveBtn.addEventListener('click', () => {
  endSession();
});

window.addEventListener('beforeunload', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave' }));
  }
});

async function startSession(roomId) {
  if (ws) {
    ws.close();
  }

  clientId = null;
  remoteLocation = null;
  lastLocationSent = null;
  lastLocationSentAt = 0;

  stopLocationWatch();

  if (hasGeolocationSupport) {
    updateLocalLocationDisplay(null, 'Solicitando permisos de geolocalización…');
    lastGeolocationErrorMessage = 'Solicitando permisos de geolocalización…';
  } else {
    updateLocalLocationDisplay(null, 'Tu navegador no soporta geolocalización.');
    lastGeolocationErrorMessage = 'Tu navegador no soporta geolocalización.';
  }
  updateRemoteLocationDisplay(null, 'Esperando a la otra persona…');
  updateDistanceInfo('A la espera de ambas ubicaciones.');

  localLocation = null;
  if (hasGeolocationSupport) {
    try {
      const position = await requestCurrentLocation();
      localLocation = position;
      updateLocalLocationDisplay(localLocation);
      lastGeolocationErrorMessage = null;
    } catch (error) {
      console.warn('No se pudo obtener la ubicación inicial', error);
      lastGeolocationErrorMessage = describeGeolocationError(error);
      updateLocalLocationDisplay(null, lastGeolocationErrorMessage);
    }
    startLocationWatch();
  }

  const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream = media;
  localVideo.srcObject = localStream;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${window.location.host}/signal`);

  ws.onopen = () => {
    const joinPayload = { type: 'join', roomId };
    if (localLocation) {
      joinPayload.location = localLocation;
    }
    ws.send(JSON.stringify(joinPayload));
    updateStatus('Esperando a la otra persona…');
    sessionSection.hidden = true;
    callSection.hidden = false;
    startTimer();
    sendLocationUpdate(true);
  };

  ws.onmessage = async (event) => {
    const data = safeParse(event.data);
    if (!data) return;
    switch (data.type) {
      case 'joined':
        clientId = data.clientId || null;
        break;
      case 'location_ack':
        localLocation = data.location || null;
        if (localLocation) {
          updateLocalLocationDisplay(localLocation);
          lastGeolocationErrorMessage = null;
        } else {
          updateLocalLocationDisplay(null, lastGeolocationErrorMessage || 'Ubicación no disponible.');
        }
        updateDistanceInfo();
        break;
      case 'location_update': {
        const senderId = data.from || data.peerId || null;
        if (!senderId || senderId !== clientId) {
          remoteLocation = data.location || null;
          if (remoteLocation) {
            updateRemoteLocationDisplay(remoteLocation);
          } else {
            updateRemoteLocationDisplay(null, 'Ubicación no disponible.');
          }
          updateDistanceInfo();
        }
        break;
      }
      case 'ready':
        isInitiator = Boolean(data.initiator);
        await ensurePeerConnection();
        if (isInitiator) {
          await createOffer();
        }
        break;
      case 'offer':
        await ensurePeerConnection();
        if (data.sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));
          await createAnswer();
        }
        break;
      case 'answer':
        if (data.sdp && peerConnection) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
        }
        break;
      case 'ice':
        if (data.candidate && peerConnection) {
          try {
            await peerConnection.addIceCandidate(data.candidate);
          } catch (err) {
            console.error('Error al añadir candidato ICE', err);
          }
        }
        break;
      case 'peer_left':
        updateStatus('La otra persona abandonó la sala.');
        resetRemoteMedia();
        break;
      case 'room_full':
        endSession('La sala ya tiene dos participantes.');
        break;
      case 'error':
        updateStatus(data.message || 'Ocurrió un error inesperado.');
        break;
      default:
        break;
    }
  };

  ws.onerror = () => {
    updateStatus('Error en la conexión de señalización.');
  };

  ws.onclose = () => {
    endSession('Conexión cerrada.');
  };
}

async function ensurePeerConnection() {
  if (peerConnection) {
    return peerConnection;
  }
  peerConnection = new RTCPeerConnection({ iceServers });
  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ice', candidate }));
    }
  };
  peerConnection.ontrack = ({ streams }) => {
    if (streams && streams[0]) {
      remoteVideo.srcObject = streams[0];
      remoteLabel.textContent = 'Invitado conectado';
    }
  };
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') {
      updateStatus('Entrevista en curso.');
      startQualityMonitor();
    } else if (state === 'disconnected' || state === 'failed') {
      updateStatus('Conexión inestable, intentando recuperar…');
    }
  };

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  return peerConnection;
}

async function createOffer() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  ws?.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
}

async function createAnswer() {
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  ws?.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
}

function updateStatus(message) {
  statusEl.textContent = message ?? '';
}

function safeParse(payload) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

function resetRemoteMedia() {
  remoteVideo.srcObject = null;
  remoteLabel.textContent = 'Invitado';
  remoteLocation = null;
  updateRemoteLocationDisplay(null, 'Esperando a la otra persona…');
  updateDistanceInfo(localLocation ? 'A la espera de la ubicación de la otra persona.' : 'A la espera de ambas ubicaciones.');
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  stopQualityMonitor();
}

function stopScreenShare() {
  if (!screenStream) return;
  const screenTrack = screenStream.getTracks()[0];
  screenTrack?.stop();
  const cameraTrack = localStream?.getVideoTracks()[0];
  const sender = peerConnection?.getSenders().find((s) => s.track?.kind === 'video');
  if (sender && cameraTrack) {
    sender.replaceTrack(cameraTrack);
  }
  screenStream = null;
  shareScreenBtn.textContent = 'Compartir pantalla';
  remoteLabel.textContent = remoteVideo.srcObject ? 'Invitado conectado' : 'Invitado';
}

function endSession(message = 'Sesión finalizada.') {
  stopTimer();
  stopQualityMonitor();
  stopLocationWatch();
  remoteLocation = null;
  updateRemoteLocationDisplay(null, 'Esperando a la otra persona…');
  updateDistanceInfo(localLocation ? 'A la espera de la ubicación de la otra persona.' : 'A la espera de ambas ubicaciones.');

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'leave' }));
    ws.close();
  }
  ws = null;

  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }

  stopScreenShare();

  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;

  remoteVideo.srcObject = null;
  localVideo.srcObject = null;

  callSection.hidden = true;
  sessionSection.hidden = false;
  isInitiator = false;
  updateStatus(message);
}

function startTimer() {
  callStart = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - callStart;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerEl.textContent = '00:00';
}

function startQualityMonitor() {
  stopQualityMonitor();
  if (!peerConnection) return;
  lastVideoStats = null;
  qualityInterval = setInterval(async () => {
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) {
          let bitrateInfo = 'calculando…';
          if (lastVideoStats && report.timestamp > lastVideoStats.timestamp) {
            const bytesDiff = report.bytesSent - lastVideoStats.bytesSent;
            const timeDiff = report.timestamp - lastVideoStats.timestamp;
            const bitrate = timeDiff > 0 ? (bytesDiff * 8) / (timeDiff / 1000) : 0;
            const kbps = bitrate / 1000;
            bitrateInfo = `${Math.max(0, kbps).toFixed(0)} kbps`;
          }
          lastVideoStats = { bytesSent: report.bytesSent, timestamp: report.timestamp };
          const fps = report.framesPerSecond ?? '–';
          const loss = report.packetsLost ?? 0;
          qualityEl.textContent = `Bitrate: ${bitrateInfo} · FPS: ${fps} · Paquetes perdidos: ${loss}`;
        }
      });
    } catch (error) {
      console.error('No se pudieron obtener métricas de calidad', error);
    }
  }, 3000);
}

function stopQualityMonitor() {
  if (qualityInterval) {
    clearInterval(qualityInterval);
    qualityInterval = null;
  }
  lastVideoStats = null;
  qualityEl.textContent = '';
}

function requestCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!hasGeolocationSupport) {
      reject(new Error('Geolocalización no soportada.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = extractLocation(position);
        if (location) {
          resolve(location);
        } else {
          reject(new Error('Datos de geolocalización inválidos.'));
        }
      },
      (error) => reject(error),
      GEOLOCATION_OPTIONS,
    );
  });
}

function startLocationWatch() {
  if (!hasGeolocationSupport) {
    return;
  }
  stopLocationWatch();
  geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const nextLocation = extractLocation(position);
      if (!nextLocation) {
        return;
      }
      localLocation = nextLocation;
      updateLocalLocationDisplay(localLocation);
      lastGeolocationErrorMessage = null;
      updateDistanceInfo();
      sendLocationUpdate();
    },
    (error) => {
      console.warn('No se pudo actualizar la geolocalización', error);
      if (!localLocation) {
        lastGeolocationErrorMessage = describeGeolocationError(error);
        updateLocalLocationDisplay(null, lastGeolocationErrorMessage);
      }
      if (typeof error?.code === 'number' && error.code === error.PERMISSION_DENIED) {
        stopLocationWatch();
      }
    },
    GEOLOCATION_OPTIONS,
  );
}

function stopLocationWatch() {
  if (geolocationWatchId !== null && hasGeolocationSupport) {
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
  }
}

function sendLocationUpdate(force = false) {
  if (!localLocation || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const now = Date.now();
  if (!force && lastLocationSent) {
    const distance = haversineDistanceKm(localLocation, lastLocationSent);
    const recentlySent = now - lastLocationSentAt < 10000;
    if (distance < 0.05 && recentlySent) {
      return;
    }
  }

  ws.send(JSON.stringify({ type: 'location_update', location: localLocation }));
  lastLocationSent = { ...localLocation };
  lastLocationSentAt = now;
}

function updateLocalLocationDisplay(location, message) {
  if (!localLocationEl) return;
  if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    localLocationEl.innerHTML = renderLocationDetails(location);
  } else {
    localLocationEl.innerHTML = `<p class="location__info">${message || 'Ubicación no disponible.'}</p>`;
  }
}

function updateRemoteLocationDisplay(location, message) {
  if (!remoteLocationEl) return;
  if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    remoteLocationEl.innerHTML = renderLocationDetails(location);
  } else {
    remoteLocationEl.innerHTML = `<p class="location__info">${message || 'Ubicación no disponible.'}</p>`;
  }
}

function updateDistanceInfo(message) {
  if (!distanceEl) return;
  distanceEl.classList.remove('location__distance--warning');
  if (message) {
    distanceEl.textContent = message;
    return;
  }

  if (localLocation && remoteLocation) {
    const distanceKm = haversineDistanceKm(localLocation, remoteLocation);
    const sameSpot = distanceKm * 1000 < 100;
    const readable = formatDistance(distanceKm);
    if (sameSpot) {
      distanceEl.textContent = `Los participantes parecen estar en la misma ubicación (${readable}).`;
      distanceEl.classList.add('location__distance--warning');
    } else {
      distanceEl.textContent = `Distancia estimada entre participantes: ${readable}.`;
    }
  } else if (!localLocation && !remoteLocation) {
    distanceEl.textContent = 'A la espera de ambas ubicaciones.';
  } else if (!localLocation) {
    distanceEl.textContent = 'A la espera de tu ubicación.';
  } else {
    distanceEl.textContent = 'A la espera de la ubicación de la otra persona.';
  }
}

function renderLocationDetails(location) {
  const details = [];
  details.push(`<p><strong>Coordenadas:</strong> ${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)}</p>`);
  if (typeof location.accuracy === 'number') {
    details.push(`<p><strong>Precisión:</strong> ±${Math.round(location.accuracy)} m</p>`);
  }
  details.push(`<p><strong>Verificado:</strong> ${formatTimestamp(location.timestamp)}</p>`);
  details.push(
    `<p><a href="${buildMapLink(location)}" target="_blank" rel="noopener">Ver en mapa</a></p>`,
  );
  return details.join('');
}

function formatCoordinate(value) {
  return Number.parseFloat(value).toFixed(5);
}

function formatTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return 'Desconocido';
  }
  return date.toLocaleString();
}

function buildMapLink(location) {
  return `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
}

function describeGeolocationError(error) {
  if (!error) {
    return 'Ubicación no disponible.';
  }
  const code = typeof error.code === 'number' ? error.code : null;
  if (code === error.PERMISSION_DENIED) {
    return 'Permiso de geolocalización denegado. Activa los permisos del navegador para verificar la ubicación.';
  }
  if (code === error.POSITION_UNAVAILABLE) {
    return 'No se pudo determinar la ubicación. Comprueba tu conexión o la señal GPS.';
  }
  if (code === error.TIMEOUT) {
    return 'La solicitud de ubicación tardó demasiado. Intenta de nuevo.';
  }
  if (typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return 'Ubicación no disponible.';
}

function extractLocation(position) {
  if (!position?.coords) {
    return null;
  }
  const { latitude, longitude, accuracy } = position.coords;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  const location = {
    latitude: Number(latitude),
    longitude: Number(longitude),
    timestamp: typeof position.timestamp === 'number' ? position.timestamp : Date.now(),
  };
  if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
    location.accuracy = accuracy;
  }
  return location;
}

function haversineDistanceKm(a, b) {
  const earthRadiusKm = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2) ** 2;
  const sinLon = Math.sin(dLon / 2) ** 2;
  const h = sinLat + sinLon * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusKm * c;
}

function formatDistance(km) {
  if (!Number.isFinite(km)) {
    return 'desconocida';
  }
  if (km >= 1) {
    return `${km.toFixed(2)} km`;
  }
  return `${Math.round(km * 1000)} m`;
}
