'use strict';

const params      = new URLSearchParams(location.search);
const interviewId = params.get('id');

(async () => {
  if (!interviewId) { alert('Parámetro de entrevista faltante.'); return; }

  try { await fetchJSON('/api/auth/me'); }
  catch { location.replace('/login'); return; }

  let data;
  try {
    data = await fetchJSON(`/api/interviews/${interviewId}`);
  } catch {
    alert('No se pudo cargar el expediente.'); return;
  }

  const session      = data.session     || {};
  const questionnaire = data.questionnaire || null;
  const photos       = data.photos      || [];

  // ── Encabezado ──────────────────────────────────────────────────────────────
  document.title = `${data.folio || data.id} – Expediente`;
  setEl('exp-folio',  data.folio || '');
  setEl('exp-title',  data.title);

  const typeBadge   = document.getElementById('exp-type-badge');
  const statusBadge = document.getElementById('exp-status-badge');
  typeBadge.textContent  = data.type === 'pyme' ? 'Pyme' : 'Fiduciario';
  typeBadge.className    = `badge badge-${data.type}`;
  statusBadge.textContent = statusLabel(data.status);
  statusBadge.className   = `badge badge-${data.status}`;

  setEl('exp-interviewee', data.interviewee_name);
  setEl('exp-date', fmtDate(data.scheduled_at));

  // Datos de sesión
  if (session.duration_seconds) {
    const m = Math.floor(session.duration_seconds / 60);
    const s = session.duration_seconds % 60;
    setEl('exp-duration', `${m} min ${s} seg`);
  } else {
    setEl('exp-duration', '—');
  }

  if (session.interviewee_location_lat) {
    const lat = session.interviewee_location_lat.toFixed(5);
    const lng = session.interviewee_location_lng.toFixed(5);
    const url = `https://maps.google.com/?q=${lat},${lng}`;
    document.getElementById('exp-geo').innerHTML =
      `<a href="${url}" target="_blank" rel="noopener">${lat}, ${lng} 🗺</a>`;
  } else {
    setEl('exp-geo', '—');
  }

  setEl('exp-ip', session.interviewee_ip || '—');

  // Entrevistador (viene en el listado)
  setEl('exp-interviewer', data.interviewer_name || '—');

  // ── Grabación ───────────────────────────────────────────────────────────────
  if (session.recording_filename) {
    const videoUrl = `/recordings/${interviewId}/${session.recording_filename}`;
    const videoEl  = document.getElementById('exp-video');
    const dlBtn    = document.getElementById('btn-download-video');
    videoEl.src    = videoUrl;
    dlBtn.href     = videoUrl;
    dlBtn.download = `${data.folio || data.id}-grabacion.webm`;
    document.getElementById('no-recording').hidden  = true;
    document.getElementById('video-player-wrap').hidden = false;
  }

  // ── Fotografías ─────────────────────────────────────────────────────────────
  const photosEl = document.getElementById('exp-photos');
  if (photos.length > 0) {
    document.getElementById('photo-badge').textContent = photos.length;
    photosEl.innerHTML = photos.map((p) => `
      <div class="exp-photo-card">
        <a href="/uploads/${interviewId}/${p.filename}" target="_blank">
          <img src="/uploads/${interviewId}/${p.filename}" alt="Foto" loading="lazy" />
        </a>
        <div class="exp-photo-meta">
          <span>${p.captured_by === 'interviewer' ? '🎙 Entrev.' : '👤 Entrev.'}</span>
          <span>${p.captured_at ? new Date(p.captured_at).toLocaleTimeString('es-MX') : ''}</span>
        </div>
      </div>
    `).join('');
  }

  // ── Cuestionario ────────────────────────────────────────────────────────────
  const qPage  = data.type === 'pyme' ? '/questionnaire-pyme' : '/questionnaire';
  const rRoute = data.type === 'pyme' ? 'pyme' : 'fiduciario';

  document.getElementById('btn-open-q').href   = `${qPage}?id=${interviewId}`;
  document.getElementById('btn-view-pdf').href  = `/report/${rRoute}/${interviewId}`;
  document.getElementById('btn-dl-word').href   = `/export/${rRoute}/${interviewId}`;
  document.getElementById('btn-dl-word').setAttribute('download', '');

  if (questionnaire) {
    const completed = questionnaire.completed;
    const updatedAt = questionnaire.updated_at
      ? new Date(questionnaire.updated_at).toLocaleString('es-MX')
      : '';
    const qStatusMsg = document.getElementById('q-status-msg');
    qStatusMsg.innerHTML =
      completed
        ? `<span style="color:var(--success)">✅ Completado</span> · ${updatedAt}`
        : `<span style="color:var(--warning)">⏳ En progreso</span> · Último guardado: ${updatedAt}`;
    document.getElementById('q-actions').hidden = false;

    if (!completed) {
      const btnMark = document.getElementById('btn-mark-complete');
      btnMark.hidden = false;
      btnMark.addEventListener('click', async () => {
        btnMark.disabled = true;
        btnMark.textContent = 'Guardando…';
        try {
          const responses = JSON.parse(questionnaire.responses || '{}');
          await fetch(`/api/interviews/${interviewId}/questionnaire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responses, completed: true }),
          });
          qStatusMsg.innerHTML = `<span style="color:var(--success)">✅ Completado</span> · ${new Date().toLocaleString('es-MX')}`;
          btnMark.hidden = true;
        } catch {
          alert('Error al marcar como completado. Intenta de nuevo.');
          btnMark.disabled = false;
          btnMark.textContent = '✅ Marcar como completado';
        }
      });
    }
  }

  // ── Notas ────────────────────────────────────────────────────────────────────
  if (data.notes) {
    document.getElementById('section-notes').hidden = false;
    setEl('exp-notes', data.notes);
  }
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusLabel(s) {
  return { scheduled: 'Programada', in_progress: 'En curso', completed: 'Completada', cancelled: 'Cancelada' }[s] || s;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
