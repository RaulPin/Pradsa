'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: [
      'turn:pradsavisitasvirtuales.com.mx:3478',
      'turns:pradsavisitasvirtuales.com.mx:5349',
    ],
    username: 'pradsa',
    credential: 'TurnPradsa2026',
  },
];
const WS_RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

// ─── Estado ───────────────────────────────────────────────────────────────────
let token;
let interviewId;
let interviewData;
let localStream;
let ws;
let pc;
let callStartTs;
let timerInterval;
let wsReconnectAttempt = 0;
let wsReconnecting     = false;
let facingMode         = 'user';      // 'user' (frontal) | 'environment' (trasera)
let hasMultipleCameras = false;
let _rawCamStream      = null;        // Stream real de cámara (no canvas)
let _hiddenCamVideo    = null;        // Video oculto para canvas stream
let _canvasEl          = null;        // Canvas compartido

// Permisos
let permCamera   = false;
let permMic      = false;
let permLocation = false;
let geoCoords    = null;

// ─── Pantallas ────────────────────────────────────────────────────────────────
const pageWrapper = document.getElementById('join-page-wrapper');

const screens = {
  loading:     document.getElementById('screen-loading'),
  error:       document.getElementById('screen-error'),
  permissions: document.getElementById('screen-permissions'),
  waiting:     document.getElementById('screen-waiting'),
  call:        document.getElementById('screen-call'),
  ended:       document.getElementById('screen-ended'),
};

function show(name) {
  // Ocultar/mostrar el wrapper de tarjetas vs. la vista de llamada full-screen
  pageWrapper.hidden = (name === 'call');

  Object.entries(screens).forEach(([k, el]) => {
    if (el) el.hidden = k !== name;
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  show('loading');
  const params = new URLSearchParams(location.search);
  token = params.get('token');

  if (!token) { showError('Enlace de entrevista inválido. Verifica el enlace que recibiste.'); return; }

  try {
    const res  = await fetch(`/api/interviews/join?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Enlace inválido.'); return; }

    interviewData = data;
    interviewId   = data.id;

    document.getElementById('interview-title-display').textContent = data.title;
    document.getElementById('join-call-title').textContent         = data.title;

    if (data.declaredAddress) {
      document.getElementById('declared-address').textContent = data.declaredAddress;
      document.getElementById('declared-address-box').hidden  = false;
    }

    // Detectar si hay más de una cámara (para mostrar botón voltear)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === 'videoinput');
      hasMultipleCameras = cameras.length > 1;
    } catch { hasMultipleCameras = false; }

    show('permissions');
    document.getElementById('btn-request-perms').addEventListener('click', requestPermissions);
  } catch {
    showError('Error de red. Verifica tu conexión e intenta nuevamente.');
  }
})();

// ─── Canvas stream – bypasea límite 720p de WebRTC en Android ────────────────
// Crea canvas+loop una sola vez; al cambiar cámara solo actualiza srcObject.
function _ensureCanvasLoop() {
  if (_canvasEl) return;
  _canvasEl = document.createElement('canvas');
  _hiddenCamVideo = document.createElement('video');
  _hiddenCamVideo.muted = true;
  _hiddenCamVideo.playsInline = true;
  const ctx = _canvasEl.getContext('2d', { alpha: false });
  (function draw() {
    if (_hiddenCamVideo.readyState >= 2) {
      ctx.drawImage(_hiddenCamVideo, 0, 0, _canvasEl.width, _canvasEl.height);
    }
    requestAnimationFrame(draw);
  })();
}

function buildCanvasStream(rawStream) {
  return new Promise((resolve) => {
    _ensureCanvasLoop();
    const videoTrack = rawStream.getVideoTracks()[0];
    const settings   = videoTrack.getSettings();
    _canvasEl.width  = settings.width  || 1920;
    _canvasEl.height = settings.height || 1080;

    _hiddenCamVideo.srcObject = new MediaStream([videoTrack]);
    _hiddenCamVideo.addEventListener('loadedmetadata', () => {
      _hiddenCamVideo.play();
      const canvasStream = _canvasEl.captureStream(30);
      resolve(new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...rawStream.getAudioTracks(),
      ]));
    }, { once: true });
  });
}

// ─── Solicitar permisos ───────────────────────────────────────────────────────
async function requestPermissions() {
  const errEl = document.getElementById('perm-error');
  const btn   = document.getElementById('btn-request-perms');
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Solicitando permisos…';

  try {
    // Cámara + micrófono
    try {
      _rawCamStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width:     { ideal: 3840 },
          height:    { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      // Re-enumerar cámaras DESPUÉS de obtener el permiso (corrección iOS Safari:
      // antes del permiso solo devuelve 1 dispositivo aunque haya más)
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        hasMultipleCameras = devs.filter((d) => d.kind === 'videoinput').length > 1;
      } catch { /* mantener valor anterior */ }

      localStream = await buildCanvasStream(_rawCamStream);
      permCamera = true;
      permMic    = true;
      setPermStatus('status-camera', 'Concedido', 'perm-camera');
      setPermStatus('status-mic',    'Concedido', 'perm-mic');
      document.getElementById('preview-video').srcObject = _rawCamStream;
    } catch (camErr) {
      if (camErr.name === 'NotAllowedError' || camErr.name === 'PermissionDeniedError') {
        setPermStatus('status-camera', 'Denegado', 'perm-camera', true);
        setPermStatus('status-mic',    'Denegado', 'perm-mic',    true);
        showPermError('Debes permitir el acceso a la cámara y micrófono para continuar.');
      } else {
        showPermError('Error al acceder a la cámara: ' + (camErr.message || camErr));
      }
      btn.disabled = false;
      btn.textContent = 'Solicitar permisos e ingresar';
      return;
    }

    // Ubicación GPS
    try {
      geoCoords = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        })
      );
      permLocation = true;
      setPermStatus('status-location', 'Concedido', 'perm-location');
    } catch {
      setPermStatus('status-location', 'Denegado', 'perm-location', true);
      showPermError('La ubicación GPS es obligatoria. Actívala en tu navegador e intenta de nuevo.');
      btn.disabled = false;
      btn.textContent = 'Solicitar permisos e ingresar';
      return;
    }

    await sendLocation();

    if (interviewData.declaredAddress) {
      document.getElementById('location-mismatch').hidden = false;
    }

    // Mostrar botón voltear en sala de espera (post-permiso, ya con conteo correcto)
    const flipWaiting = document.getElementById('btn-flip-waiting');
    if (flipWaiting) flipWaiting.hidden = !hasMultipleCameras;
    // Actualizar también el botón en la sala de llamada (por si ya era visible)
    const btnFlipCall = document.getElementById('join-btn-flip');
    if (btnFlipCall) btnFlipCall.style.display = hasMultipleCameras ? '' : 'none';

    show('waiting');
    connectSignaling();
  } catch (err) {
    showPermError('Error inesperado: ' + (err.message || err));
    btn.disabled = false;
    btn.textContent = 'Solicitar permisos e ingresar';
  }
}

// ─── Cambiar cámara (frontal ↔ trasera) ──────────────────────────────────────
async function flipCamera() {
  if (!localStream) return;

  facingMode = facingMode === 'user' ? 'environment' : 'user';

  try {
    // Parar pistas de cámara raw anteriores
    if (_rawCamStream) _rawCamStream.getVideoTracks().forEach((t) => t.stop());

    // Obtener nueva pista con el facing contrario
    _rawCamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width:     { ideal: 3840 },
        height:    { ideal: 2160 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    // Actualizar hidden video — el canvas loop lo pinta automáticamente
    const newVideoTrack = _rawCamStream.getVideoTracks()[0];
    const settings = newVideoTrack.getSettings();
    _canvasEl.width  = settings.width  || 1920;
    _canvasEl.height = settings.height || 1080;
    _hiddenCamVideo.srcObject = new MediaStream([newVideoTrack]);
    await _hiddenCamVideo.play();

    // Actualizar preview local
    const previewEl   = document.getElementById('preview-video');
    const localCallEl = document.getElementById('join-local-video');
    if (previewEl   && previewEl.srcObject)   previewEl.srcObject   = _rawCamStream;
    if (localCallEl && localCallEl.srcObject) localCallEl.srcObject = _rawCamStream;

    // El canvas stream ya está en el PeerConnection — no hay que reemplazar nada
  } catch (err) {
    console.warn('[flipCamera] Error:', err.message);
    // Revertir facingMode si falla
    facingMode = facingMode === 'user' ? 'environment' : 'user';
  }
}

// ─── Enviar ubicación ─────────────────────────────────────────────────────────
async function sendLocation() {
  if (!geoCoords) return;
  const { latitude, longitude } = geoCoords.coords;
  const address = `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`;
  await fetch(`/api/interviews/join/location?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, address }),
  }).catch(() => {});
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connectSignaling() {
  wsReconnecting = false;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/signal`);

  ws.onopen = () => {
    wsReconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'join', interviewId, authType: 'interviewee', token }));
  };
  ws.onmessage  = (ev) => { const m = safeParse(ev.data); if (m) handleSignal(m); };
  ws.onclose    = () => { setJoinConnStatus('disconnected'); scheduleWsReconnect(); };
  ws.onerror    = () => setJoinConnStatus('disconnected');
}

function scheduleWsReconnect() {
  if (wsReconnecting) return;
  wsReconnecting = true;
  const delay = WS_RECONNECT_DELAYS[Math.min(wsReconnectAttempt, WS_RECONNECT_DELAYS.length - 1)];
  wsReconnectAttempt++;
  showJoinStatus(`Reconectando en ${delay / 1000}s…`);
  setTimeout(() => connectSignaling(), delay);
}

// ─── Señalización WebRTC ──────────────────────────────────────────────────────
async function handleSignal(msg) {
  switch (msg.type) {
    case 'joined': break;

    case 'peer_joined':
      show('call');
      document.getElementById('join-local-video').srcObject = localStream;
      // Mostrar botón voltear en llamada
      if (hasMultipleCameras) {
        document.getElementById('join-btn-flip').style.display = '';
      }
      setJoinConnStatus('connecting');
      await ensurePeerConnection();
      if (msg.initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsSend({ type: 'offer', sdp: boostVideoSdp(offer.sdp) });
      }
      break;

    case 'offer':
      await ensurePeerConnection();
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsSend({ type: 'answer', sdp: boostVideoSdp(answer.sdp) });
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
      showJoinStatus('El entrevistador abandonó temporalmente. Esperando reconexión…');
      document.getElementById('join-remote-placeholder').hidden = false;
      document.getElementById('join-remote-video').srcObject = null;
      break;

    case 'call_ended':
      endCall('La entrevista ha finalizado. Gracias por tu participación.');
      break;

    case 'error':
      showJoinStatus(msg.message || 'Error de señalización.');
      break;

    default: break;
  }
}

// ─── Peer Connection ──────────────────────────────────────────────────────────
async function ensurePeerConnection() {
  if (pc) return;
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = ({ candidate }) => { if (candidate) wsSend({ type: 'ice', candidate }); };

  pc.ontrack = ({ streams }) => {
    if (streams?.[0]) {
      document.getElementById('join-remote-video').srcObject = streams[0];
      document.getElementById('join-remote-placeholder').hidden = true;
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
      setJoinConnStatus('connected');
      hideJoinStatus();
      startTimer();
      setHighVideoBitrate();
    } else if (state === 'disconnected') {
      setJoinConnStatus('disconnected');
      showJoinStatus('Conexión inestable, intentando recuperar…');
      pc.restartIce();
    } else if (state === 'failed') {
      setJoinConnStatus('disconnected');
      showJoinStatus('Conexión perdida. Si el problema persiste, recarga la página.');
      resetPc();
    }
  };

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}

function boostVideoSdp(sdp) {
  // Aumenta el ancho de banda de video a 20 Mbps en el SDP
  const lines = sdp.split('\r\n');
  const out = [];
  let inVideo = false;
  let bAdded = false;
  for (const line of lines) {
    if (line.startsWith('m=video')) { inVideo = true; bAdded = false; }
    else if (line.startsWith('m=')) { inVideo = false; }
    if (inVideo && line.startsWith('b=AS:')) {
      out.push('b=AS:20000'); bAdded = true; continue;
    }
    out.push(line);
    if (inVideo && !bAdded && line.startsWith('c=')) {
      out.push('b=AS:20000'); bAdded = true;
    }
  }
  return out.join('\r\n');
}

async function setHighVideoBitrate() {
  const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate   = 8_000_000; // 8 Mbps
    params.encodings[0].maxFramerate = 60;
    await sender.setParameters(params);
  } catch (e) {
    console.warn('[BITRATE]', e.message);
  }
}

function resetPc() {
  if (!pc) return;
  pc.ontrack = null;
  pc.onicecandidate = null;
  pc.onconnectionstatechange = null;
  pc.close();
  pc = null;
}

// ─── Controles ────────────────────────────────────────────────────────────────
(function initControls() {
  // Silenciar
  document.getElementById('join-btn-mute')?.addEventListener('click', () => {
    const t = localStream?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    const btn = document.getElementById('join-btn-mute');
    btn.classList.toggle('active', !t.enabled);
    btn.querySelector('.ctrl-label').textContent = t.enabled ? 'Silenciar' : 'Activar mic';
  });

  // Cámara on/off
  document.getElementById('join-btn-video')?.addEventListener('click', () => {
    const t = localStream?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    const btn = document.getElementById('join-btn-video');
    btn.classList.toggle('active', !t.enabled);
    btn.querySelector('.ctrl-label').textContent = t.enabled ? 'Cámara' : 'Sin cámara';
  });

  // Voltear cámara (llamada)
  const btnFlip = document.getElementById('join-btn-flip');
  if (btnFlip) {
    // Ocultar si no hay múltiples cámaras; se muestra al hacer show('call')
    if (!hasMultipleCameras) btnFlip.style.display = 'none';
    btnFlip.addEventListener('click', flipCamera);
  }

  // Voltear cámara (sala de espera)
  document.getElementById('btn-flip-waiting')?.addEventListener('click', flipCamera);

  // Verificar ubicación GPS durante la llamada
  document.getElementById('join-btn-geo')?.addEventListener('click', async () => {
    const btn  = document.getElementById('join-btn-geo');
    const icon = btn.querySelector('.ctrl-icon');
    const lbl  = btn.querySelector('.ctrl-label');
    btn.disabled = true;
    icon.textContent = '⏳';
    lbl.textContent  = 'Capturando…';
    try {
      geoCoords = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
        })
      );
      await sendLocation();
      icon.textContent = '✅';
      lbl.textContent  = 'Verificado';
    } catch {
      icon.textContent = '❌';
      lbl.textContent  = 'Sin GPS';
    } finally {
      setTimeout(() => {
        icon.textContent = '📍';
        lbl.textContent  = 'Ubicación';
        btn.disabled = false;
      }, 3000);
    }
  });

  // Finalizar
  document.getElementById('join-btn-end')?.addEventListener('click', () => {
    if (confirm('¿Deseas finalizar la entrevista?')) {
      wsSend({ type: 'end_call' });
      endCall('Has finalizado la entrevista.');
    }
  });

  window.addEventListener('beforeunload', () => wsSend({ type: 'leave' }));
})();

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  callStartTs = Date.now();
  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - callStartTs) / 1000);
    const m   = String(Math.floor(sec / 60)).padStart(2, '0');
    const s   = String(sec % 60).padStart(2, '0');
    const el  = document.getElementById('join-timer');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

// ─── Finalizar ────────────────────────────────────────────────────────────────
function endCall(msg) {
  clearInterval(timerInterval);
  ws?.close(); ws = null;
  resetPc();
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  document.getElementById('ended-message').textContent = msg;
  show('ended');
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('error-message').textContent = msg;
  show('error');
}

function setPermStatus(elId, text, rowId, denied = false) {
  const el  = document.getElementById(elId);
  const row = document.getElementById(rowId);
  if (el)  { el.textContent = text; el.className = `perm-status ${denied ? 'denied' : 'granted'}`; }
  if (row) { row.style.borderColor = denied ? 'rgba(239,68,68,.4)' : 'rgba(34,197,94,.4)'; }
}

function showPermError(msg) {
  const el = document.getElementById('perm-error');
  el.textContent = msg; el.hidden = false;
}

function setJoinConnStatus(state) {
  const el = document.getElementById('join-conn-status');
  if (el) el.className = `conn-dot ${state}`;
}

function showJoinStatus(msg) {
  const el = document.getElementById('join-status-bar');
  if (el) { el.textContent = msg; el.hidden = false; }
}

function hideJoinStatus() {
  const el = document.getElementById('join-status-bar');
  if (el) el.hidden = true;
}

function wsSend(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}
