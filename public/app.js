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
const questionListEl = document.getElementById('question-list');
const generalNotesEl = document.getElementById('notes');
const downloadDocxBtn = document.getElementById('download-docx');
const downloadTextBtn = document.getElementById('download-text');

const INTERVIEW_QUESTIONS = [
  { id: 'presentacion', prompt: '¿Puedes contarme brevemente sobre tu experiencia reciente?' },
  { id: 'logros', prompt: '¿Cuál consideras que ha sido tu mayor logro profesional y por qué?' },
  { id: 'colaboracion', prompt: 'Describe una situación en la que colaboraste para resolver un desafío complejo.' },
  { id: 'aprendizaje', prompt: '¿Qué aprendiste de tu último proyecto o rol que te gustaría aplicar aquí?' },
  { id: 'expectativas', prompt: '¿Qué esperas del puesto y del equipo si te incorporas?' },
];

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
let notesExportedAutomatically = false;

renderInterviewQuestions();
attachNotesActions();

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

function renderInterviewQuestions() {
  if (!questionListEl) return;
  questionListEl.innerHTML = '';
  INTERVIEW_QUESTIONS.forEach((question, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'notes__item';

    const title = document.createElement('p');
    title.className = 'notes__question';
    title.textContent = `${index + 1}. ${question.prompt}`;

    const textarea = document.createElement('textarea');
    textarea.className = 'notes__response';
    textarea.placeholder = 'Escribe la respuesta…';
    textarea.dataset.questionId = question.id;

    wrapper.append(title, textarea);
    questionListEl.append(wrapper);
  });
}

function attachNotesActions() {
  downloadDocxBtn?.addEventListener('click', () => {
    const notesData = collectInterviewNotes();
    if (!hasInterviewContent(notesData)) {
      updateStatus('Completa alguna respuesta para poder descargarla.');
      return;
    }
    try {
      exportNotesAsDocx(notesData, { markAsExported: true });
      updateStatus('Se descargó el documento con tus respuestas.');
    } catch (error) {
      console.error('No se pudo generar el documento .docx', error);
      updateStatus('No se pudo generar el documento .docx.');
    }
  });

  downloadTextBtn?.addEventListener('click', () => {
    const notesData = collectInterviewNotes();
    if (!hasInterviewContent(notesData)) {
      updateStatus('Completa alguna respuesta para poder descargarla.');
      return;
    }
    try {
      exportNotesAsText(notesData);
      updateStatus('Se descargó el archivo de notas.');
    } catch (error) {
      console.error('No se pudo generar la nota en texto plano', error);
      updateStatus('No se pudo generar la nota en texto plano.');
    }
  });
}

function collectInterviewNotes() {
  const answers = INTERVIEW_QUESTIONS.map((question) => {
    const textarea = questionListEl?.querySelector(`textarea[data-question-id="${question.id}"]`);
    return {
      id: question.id,
      question: question.prompt,
      answer: textarea ? textarea.value.trim() : '',
    };
  });

  return {
    answers,
    generalNotes: generalNotesEl ? generalNotesEl.value.trim() : '',
  };
}

function hasInterviewContent(notesData) {
  if (!notesData) return false;
  const hasAnswers = notesData.answers?.some((entry) => entry.answer.length > 0);
  return Boolean(hasAnswers || (notesData.generalNotes && notesData.generalNotes.length > 0));
}

function resetInterviewNotes() {
  notesExportedAutomatically = false;
  generalNotesEl && (generalNotesEl.value = '');
  questionListEl?.querySelectorAll('textarea').forEach((textarea) => {
    textarea.value = '';
  });
}

function exportNotesAsDocx(notesData, { markAsExported = false } = {}) {
  const blob = buildDocxBlob(notesData);
  downloadBlob(blob, buildNotesFileName('docx'));
  if (markAsExported) {
    notesExportedAutomatically = true;
  }
}

function maybeAutoExportNotes() {
  if (notesExportedAutomatically) {
    return false;
  }
  const notesData = collectInterviewNotes();
  if (!hasInterviewContent(notesData)) {
    return false;
  }
  try {
    exportNotesAsDocx(notesData, { markAsExported: true });
    return true;
  } catch (error) {
    console.error('No se pudieron exportar las notas automáticamente', error);
    return false;
  }
}

function exportNotesAsText(notesData) {
  const lines = [];
  const timestamp = new Date();
  lines.push(`Notas de la entrevista (${timestamp.toLocaleString()})`);
  lines.push('');
  const answers = Array.isArray(notesData.answers) ? notesData.answers : [];
  answers.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.question}`);
    lines.push(entry.answer ? entry.answer : 'Sin respuesta.');
    lines.push('');
  });
  if (notesData.generalNotes) {
    lines.push('Notas adicionales:');
    lines.push(notesData.generalNotes);
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, buildNotesFileName('txt'));
}

function buildNotesFileName(extension) {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `entrevista-${iso}.${extension}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildDocxBlob(notesData) {
  const encoder = new TextEncoder();
  const generatedAt = new Date();
  const iso = generatedAt.toISOString();
  const files = [
    {
      name: '[Content_Types].xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
`),
    },
    {
      name: '_rels/.rels',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="R1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="R2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="R3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
`),
    },
    {
      name: 'docProps/app.xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Homepty Entrevistas</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant>
        <vt:lpstr>Temas</vt:lpstr>
      </vt:variant>
      <vt:variant>
        <vt:i4>1</vt:i4>
      </vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>Notas de la entrevista</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
  <Company>Homepty</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>
`),
    },
    {
      name: 'docProps/core.xml',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Notas de la entrevista</dc:title>
  <dc:subject>Entrevista</dc:subject>
  <dc:creator>Homepty Entrevistas</dc:creator>
  <cp:keywords>entrevista; notas</cp:keywords>
  <dc:description>Respuestas capturadas durante la sesión</dc:description>
  <cp:lastModifiedBy>Homepty Entrevistas</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>
</cp:coreProperties>
`),
    },
    {
      name: 'word/document.xml',
      data: encoder.encode(buildDocumentXml(notesData, generatedAt)),
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>
`),
    },
  ];

  const zipped = createZip(files);
  return new Blob([zipped], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function buildDocumentXml(notesData, generatedAt) {
  const answers = Array.isArray(notesData.answers) ? notesData.answers : [];
  const paragraphs = [];
  paragraphs.push(
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t>Notas de la entrevista</w:t></w:r></w:p>'
  );
  paragraphs.push(
    createParagraph(`Generado el ${generatedAt.toLocaleString('es-ES')}`, { italic: true })
  );
  paragraphs.push(createParagraph(''));

  answers.forEach((entry, index) => {
    paragraphs.push(
      createParagraph(`${index + 1}. ${entry.question}`, { bold: true })
    );
    const answerText = entry.answer ? entry.answer : 'Sin respuesta registrada.';
    paragraphs.push(createParagraph(answerText));
  });

  if (notesData.generalNotes) {
    paragraphs.push(createParagraph('Notas adicionales', { bold: true }));
    paragraphs.push(createParagraph(notesData.generalNotes));
  }

  paragraphs.push('<w:p/>');

  const body = paragraphs.join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
`;
}

function createParagraph(text, { bold = false, italic = false } = {}) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) lines.push('');
  const runs = [];
  lines.forEach((line, index) => {
    runs.push(createRun(line, { bold, italic }));
    if (index < lines.length - 1) {
      runs.push('<w:r><w:br/></w:r>');
    }
  });
  return `<w:p>${runs.join('')}</w:p>`;
}

function createRun(text, { bold = false, italic = false } = {}) {
  let runProperties = '';
  if (bold || italic) {
    runProperties = '<w:rPr>';
    if (bold) runProperties += '<w:b/>';
    if (italic) runProperties += '<w:i/>';
    runProperties += '</w:rPr>';
  }
  const safeText = escapeXml(text || ' ');
  return `<w:r>${runProperties}<w:t xml:space="preserve">${safeText}</w:t></w:r>`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = new TextEncoder().encode(file.name);
    const dataBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc >>> 0, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 0x0314, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc >>> 0, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const totalSize = offset + centralSize + endRecord.length;
  const output = new Uint8Array(totalSize);
  let position = 0;
  localParts.forEach((part) => {
    output.set(part, position);
    position += part.length;
  });
  centralParts.forEach((part) => {
    output.set(part, position);
    position += part.length;
  });
  output.set(endRecord, position);

  return output;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c >>>= 1;
      }
    }
    table[i] = c >>> 0;
  }
  return table;
})();

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

  resetInterviewNotes();

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
  const exportedNotes = maybeAutoExportNotes();
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
  updateStatus(exportedNotes ? `${message} Tus respuestas se guardaron en un documento.` : message);
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
