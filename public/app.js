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

let ws;
let peerConnection;
let localStream;
let screenStream;
let callStart;
let timerInterval;
let qualityInterval;
let isInitiator = false;
let lastVideoStats;

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

  const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream = media;
  localVideo.srcObject = localStream;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${protocol}://${window.location.host}/signal`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', roomId }));
    updateStatus('Esperando a la otra persona…');
    sessionSection.hidden = true;
    callSection.hidden = false;
    startTimer();
  };

  ws.onmessage = async (event) => {
    const data = safeParse(event.data);
    if (!data) return;
    switch (data.type) {
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
