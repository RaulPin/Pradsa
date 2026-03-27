'use strict';

// ─── Config WebRTC ────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const WS_RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

// ─── Estado ───────────────────────────────────────────────────────────────────
let interviewId;
let ws;
let pc;
let localStream;
let screenStream;
let sessionId;
let callStartTs;
let timerInterval;
let qualityInterval;
let wsReconnectAttempt = 0;
let wsReconnecting = false;
let lastVideoStats = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const localVideo   = document.getElementById('local-video');
const remoteVideo  = document.getElementById('remote-video');
const remotePlaceholder = document.getElementById('remote-placeholder');
const remoteLabel  = document.getElementById('remote-label');
const callTitle    = document.getElementById('call-title');
const callTypeBadge = document.getElementById('call-type-badge');
const statusBar    = document.getElementById('call-status-bar');
const timerEl      = document.getElementById('call-timer');
const connDot      = document.getElementById('conn-status');
const qualityEl    = document.getElementById('quality-info');
const locationEl   = document.getElementById('location-info');
const photoCount   = document.getElementById('photo-count');
const photoGallery = document.getElementById('photo-gallery');
const notesArea    = document.getElementById('notes');
const canvas       = document.getElementById('capture-canvas');

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  const params = new URLSearchParams(location.search);
  interviewId = params.get('id');

  if (!interviewId) {
    showStatus('Parámetro de entrevista faltante.', true);
    return;
  }

  // Verificar sesión
  try {
    const me = await fetchJSON('/api/auth/me');
    if (me.first_login) { location.replace('/login'); return; }
  } catch {
    location.replace('/login');
    return;
  }

  // Cargar datos de la entrevista
  try {
    const data = await fetchJSON(`/api/interviews/${interviewId}`);
    callTitle.textContent = data.title;
    callTypeBadge.textContent = data.type === 'pyme' ? 'Pyme' : 'Fiduciario';
    callTypeBadge.className = `badge badge-${data.type}`;
    notesArea.value = data.notes || '';

    // Mostrar fotos existentes
    (data.photos || []).forEach((p) => addPhotoThumb(p.filename));
    photoCount.textContent = data.photos?.length || 0;

    // Mostrar ubicación si existe
    if (data.session?.interviewee_location_lat) {
      updateLocationUI(data.session);
    }
  } catch (err) {
    showStatus('No se pudo cargar la entrevista. Verifica que tengas acceso.', true);
    return;
  }

  // Iniciar cámara
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch {
    showStatus('No se pudo acceder a la cámara/micrófono. Verifica los permisos del navegador.', true);
    return;
  }

  // Iniciar sesión en el servidor
  try {
    const s = await fetchJSON(`/api/interviews/${interviewId}/session/start`, { method: 'POST' });
    sessionId = s.sessionId;
  } catch { /* continuar aunque falle */ }

  startTimer();
  connectSignaling();
  initControls();
})();

// ─── WebSocket de señalización ────────────────────────────────────────────────
function connectSignaling() {
  wsReconnecting = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/signal`);

  ws.onopen = () => {
    wsReconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'join', interviewId, authType: 'interviewer' }));
    setConnStatus('connecting');
  };

  ws.onmessage = (ev) => {
    const msg = safeParse(ev.data);
    if (!msg) return;
    handleSignal(msg);
  };

  ws.onclose = () => {
    setConnStatus('disconnected');
    scheduleWsReconnect();
  };

  ws.onerror = () => {
    setConnStatus('disconnected');
  };
}

function scheduleWsReconnect() {
  if (wsReconnecting) return;
  wsReconnecting = true;
  const delay = WS_RECONNECT_DELAYS[Math.min(wsReconnectAttempt, WS_RECONNECT_DELAYS.length - 1)];
  wsReconnectAttempt++;
  showStatus(`Señalización desconectada. Reconectando en ${delay / 1000}s…`);
  setTimeout(() => {
    if (document.hidden) return; // no reconectar si la pestaña está oculta
    connectSignaling();
  }, delay);
}

// ─── Señalización WebRTC ──────────────────────────────────────────────────────
async function handleSignal(msg) {
  switch (msg.type) {
    case 'joined':
      showStatus('En sala. Esperando al entrevistado…');
      break;

    case 'peer_joined':
      hideStatus();
      setConnStatus('connecting');
      showStatus('Entrevistado conectado. Estableciendo videollamada…');
      await ensurePeerConnection();
      if (msg.initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsSend({ type: 'offer', sdp: offer.sdp });
      }
      break;

    case 'offer':
      await ensurePeerConnection();
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsSend({ type: 'answer', sdp: answer.sdp });
      break;

    case 'answer':
      if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      break;

    case 'ice':
      if (pc && msg.candidate) {
        try { await pc.addIceCandidate(msg.candidate); } catch { }
      }
      break;

    case 'peer_left':
      showStatus('El entrevistado abandonó la sala.');
      remotePlaceholder.hidden = false;
      remoteVideo.srcObject = null;
      remoteLabel.textContent = 'Entrevistado';
      break;

    case 'call_ended':
      endCall(false);
      break;

    case 'error':
      showStatus(msg.message || 'Error de señalización.');
      break;

    default: break;
  }
}

// ─── WebRTC Peer Connection ───────────────────────────────────────────────────
async function ensurePeerConnection() {
  if (pc) return;

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) wsSend({ type: 'ice', candidate });
  };

  pc.ontrack = ({ streams }) => {
    if (streams?.[0]) {
      remoteVideo.srcObject = streams[0];
      remotePlaceholder.hidden = true;
      remoteLabel.textContent = 'Entrevistado conectado';
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
      setConnStatus('connected');
      hideStatus();
      startQualityMonitor();
    } else if (state === 'disconnected') {
      setConnStatus('disconnected');
      showStatus('Conexión inestable, intentando recuperar…');
      pc.restartIce();
    } else if (state === 'failed') {
      setConnStatus('disconnected');
      showStatus('Conexión perdida. El entrevistado puede volver a unirse con el mismo enlace.');
      resetPc();
    }
  };

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}

function resetPc() {
  if (!pc) return;
  pc.ontrack = null;
  pc.onicecandidate = null;
  pc.onconnectionstatechange = null;
  pc.close();
  pc = null;
  stopQualityMonitor();
}

// ─── Controles ────────────────────────────────────────────────────────────────
function initControls() {
  const btnMute   = document.getElementById('btn-mute');
  const btnVideo  = document.getElementById('btn-video');
  const btnScreen = document.getElementById('btn-screen');
  const btnEnd    = document.getElementById('btn-end');

  btnMute.addEventListener('click', () => {
    const track = localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    btnMute.classList.toggle('active', !track.enabled);
    btnMute.querySelector('.ctrl-label').textContent = track.enabled ? 'Silenciar' : 'Activar mic';
  });

  btnVideo.addEventListener('click', () => {
    const track = localStream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    btnVideo.classList.toggle('active', !track.enabled);
    btnVideo.querySelector('.ctrl-label').textContent = track.enabled ? 'Cámara' : 'Sin cámara';
  });

  btnScreen.addEventListener('click', () => toggleScreenShare(btnScreen));

  btnEnd.addEventListener('click', () => {
    if (confirm('¿Finalizar la entrevista?')) endCall(true);
  });

  document.getElementById('btn-capture').addEventListener('click', capturePhoto);

  // Auto-guardar notas
  notesArea.addEventListener('input', debounce(() => {
    fetchJSON(`/api/interviews/${interviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesArea.value }),
    }).catch(() => {});
  }, 1500));

  window.addEventListener('beforeunload', () => {
    wsSend({ type: 'leave' });
  });
}

async function toggleScreenShare(btn) {
  if (screenStream) {
    stopScreenShare();
    btn.classList.remove('active');
    btn.querySelector('.ctrl-label').textContent = 'Pantalla';
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(screenTrack);
    screenTrack.onended = () => stopScreenShare();
    btn.classList.add('active');
    btn.querySelector('.ctrl-label').textContent = 'Detener';
  } catch { /* usuario canceló */ }
}

function stopScreenShare() {
  screenStream?.getTracks().forEach((t) => t.stop());
  screenStream = null;
  const cameraTrack = localStream?.getVideoTracks()[0];
  const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
  if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
}

// ─── Captura de fotos ─────────────────────────────────────────────────────────
async function capturePhoto() {
  const videoEl = remoteVideo.srcObject ? remoteVideo : localVideo;
  if (!videoEl.srcObject) { showStatus('No hay video para capturar.'); return; }

  const w = videoEl.videoWidth  || 640;
  const h = videoEl.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(videoEl, 0, 0, w, h);

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fd = new FormData();
    fd.append('photo', blob, 'captura.jpg');

    try {
      const res  = await fetch(`/api/interviews/${interviewId}/photos`, { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        addPhotoThumb(data.photo.filename);
        const cnt = parseInt(photoCount.textContent) + 1;
        photoCount.textContent = cnt;
      }
    } catch { showStatus('Error al guardar la fotografía.'); }
  }, 'image/jpeg', 0.85);
}

function addPhotoThumb(filename) {
  const div = document.createElement('div');
  div.className = 'photo-thumb';
  const img = document.createElement('img');
  img.src = `/uploads/${interviewId}/${filename}`;
  img.alt = 'Foto';
  div.appendChild(img);
  photoGallery.prepend(div);
}

// ─── Finalizar llamada ────────────────────────────────────────────────────────
function endCall(notify) {
  stopTimer();
  stopQualityMonitor();
  stopScreenShare();

  if (notify && ws?.readyState === WebSocket.OPEN) {
    wsSend({ type: 'end_call' });
  }

  ws?.close();
  ws = null;

  resetPc();

  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;

  location.replace('/dashboard');
}

// ─── Ubicación ────────────────────────────────────────────────────────────────
function updateLocationUI(session) {
  if (!session?.interviewee_location_lat) return;
  locationEl.innerHTML = `
    <p>📍 ${session.interviewee_location_address || `${session.interviewee_location_lat}, ${session.interviewee_location_lng}`}</p>
    <p style="font-size:.78rem;color:var(--muted);">
      Lat: ${session.interviewee_location_lat.toFixed(5)} &nbsp;
      Lng: ${session.interviewee_location_lng.toFixed(5)}
    </p>
  `;
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  callStartTs = Date.now();
  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - callStartTs) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ─── Monitor de calidad ───────────────────────────────────────────────────────
function startQualityMonitor() {
  stopQualityMonitor();
  qualityInterval = setInterval(async () => {
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === 'outbound-rtp' && r.kind === 'video' && !r.isRemote) {
          let bitrate = '–';
          if (lastVideoStats) {
            const bytesDiff = r.bytesSent - lastVideoStats.bytesSent;
            const timeDiff  = r.timestamp - lastVideoStats.timestamp;
            bitrate = timeDiff > 0 ? `${Math.round((bytesDiff * 8) / (timeDiff / 1000) / 1000)} kbps` : '–';
          }
          lastVideoStats = { bytesSent: r.bytesSent, timestamp: r.timestamp };
          qualityEl.innerHTML = `<b>Calidad:</b> ${bitrate} · FPS: ${r.framesPerSecond ?? '–'} · Pérd: ${r.packetsLost ?? 0}`;
        }
      });
    } catch { }
  }, 3000);
}

function stopQualityMonitor() {
  clearInterval(qualityInterval);
  qualityInterval = null;
  lastVideoStats = null;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function setConnStatus(state) {
  connDot.className = `conn-dot ${state}`;
}

function showStatus(msg, permanent = false) {
  statusBar.textContent = msg;
  statusBar.hidden = false;
  if (!permanent) setTimeout(() => { statusBar.hidden = true; }, 5000);
}

function hideStatus() {
  statusBar.hidden = true;
}

function wsSend(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
