'use strict';

const params      = new URLSearchParams(location.search);
const interviewId = params.get('id');

const PHOTO_SLOTS = [
  'foto_vialidad',
  'foto_fachada',
  'foto_interior_ejecutivo',
  'foto_inventario',
  'foto_maquinaria',
  'foto_oficinas',
  'foto_extra_1',
  'foto_extra_2',
  'foto_extra_3',
  'foto_extra_4',
  'foto_extra_5',
  'foto_extra_6',
  'foto_extra_7',
  'foto_extra_8',
];

let photos = [];
let savedResponses = {};

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!interviewId) { alert('Parámetro de entrevista faltante.'); return; }

  try {
    await fetchJSON('/api/auth/me');
  } catch {
    location.replace('/login');
    return;
  }

  try {
    const data = await fetchJSON(`/api/interviews/${interviewId}`);

    document.getElementById('q-interview-title').textContent =
      `Cuestionario Pyme – ${data.title}`;

    photos = data.photos || [];
    populatePhotoSelects();

    if (data.session?.interviewee_location_lat) {
      const lat = data.session.interviewee_location_lat;
      const lng = data.session.interviewee_location_lng;
      document.getElementById('geo-from-interview').hidden = false;
      document.getElementById('geo-coords').textContent =
        `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`;

      const urlInput = document.querySelector('[name="url_geolocalizacion"]');
      if (urlInput && !urlInput.value) {
        urlInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    }

    if (data.questionnaire?.responses) {
      try {
        savedResponses = JSON.parse(data.questionnaire.responses);
      } catch {
        savedResponses = {};
      }
      loadResponses(savedResponses);
    }
  } catch {
    alert('No se pudo cargar la entrevista. Verifica que tengas acceso.');
    return;
  }

  document.getElementById('btn-save').addEventListener('click',        async () => { validateQuestionnaire(); await save(); });
  document.getElementById('btn-save-bottom').addEventListener('click', async () => { validateQuestionnaire(); await save(); });
  document.getElementById('btn-pdf').addEventListener('click',         async () => { validateQuestionnaire(); await generatePDF(); });
  document.getElementById('btn-pdf-bottom').addEventListener('click',  async () => { validateQuestionnaire(); await generatePDF(); });
  document.getElementById('btn-word').addEventListener('click',        async () => { validateQuestionnaire(); await downloadWord(); });
  document.getElementById('btn-word-bottom').addEventListener('click', async () => { validateQuestionnaire(); await downloadWord(); });

  setInterval(save, 60000);
})();

// ─── Fotos ────────────────────────────────────────────────────────────────────
function populatePhotoSelects() {
  PHOTO_SLOTS.forEach((slot) => {
    const sel = document.getElementById(`slot-select-${slot}`);
    if (!sel) return;

    photos.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.filename;
      opt.textContent = `${p.captured_at ? new Date(p.captured_at).toLocaleTimeString('es-MX') : ''} – ${p.filename}`;
      sel.appendChild(opt);
    });

    if (savedResponses[slot]) {
      sel.value = savedResponses[slot];
      updateSlotPreview(slot, savedResponses[slot]);
    }

    sel.addEventListener('change', () => updateSlotPreview(slot, sel.value));
  });
}

function updateSlotPreview(slot, filename) {
  const preview = document.getElementById(`slot-preview-${slot}`);
  if (!preview) return;
  if (!filename) {
    preview.innerHTML = '<div class="slot-empty">Sin foto asignada</div>';
    return;
  }
  preview.innerHTML = `<img src="/uploads/${interviewId}/${filename}" alt="${slot}" />`;
}

// ─── Cargar / Guardar respuestas ──────────────────────────────────────────────
function collectResponses() {
  const form = document.querySelector('.q-container');
  const data = {};

  form.querySelectorAll('input[name], textarea[name], select[name]').forEach((el) => {
    if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
    } else {
      data[el.name] = el.value;
    }
  });

  PHOTO_SLOTS.forEach((slot) => {
    const sel = document.getElementById(`slot-select-${slot}`);
    if (sel) data[slot] = sel.value;
  });

  return data;
}

function loadResponses(responses) {
  const form = document.querySelector('.q-container');

  Object.entries(responses).forEach(([name, value]) => {
    if (PHOTO_SLOTS.includes(name)) return;

    const els = form.querySelectorAll(`[name="${name}"]`);
    els.forEach((el) => {
      if (el.type === 'radio') {
        el.checked = el.value === value;
      } else {
        el.value = value || '';
      }
    });
  });
}

async function save() {
  const responses = collectResponses();
  const statusEl  = document.getElementById('q-status-msg');
  statusEl.textContent = 'Guardando…';

  try {
    await fetch(`/api/interviews/${interviewId}/questionnaire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses, completed: false }),
    });
    savedResponses = responses;
    statusEl.textContent = `Guardado ${new Date().toLocaleTimeString('es-MX')}`;
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  } catch {
    statusEl.textContent = 'Error al guardar';
  }
}

// ─── Descargar Word ───────────────────────────────────────────────────────────
async function downloadWord() {
  await save();
  const a = document.createElement('a');
  a.href = `/export/pyme/${interviewId}`;
  a.download = '';
  a.click();
}

// ─── Generar PDF ──────────────────────────────────────────────────────────────
async function generatePDF() {
  await save();
  try {
    await fetch(`/api/interviews/${interviewId}/questionnaire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: collectResponses(), completed: true }),
    });
  } catch { /* continuar */ }

  window.open(`/report/pyme/${interviewId}`, '_blank');
}

// ─── Validación de campos incompletos ────────────────────────────────────────
function validateQuestionnaire() {
  const container = document.querySelector('.q-container');

  // Limpiar marcas previas
  container.querySelectorAll('.field-invalid').forEach((el) => el.classList.remove('field-invalid'));

  let count = 0;

  // Inputs de texto, textareas, selects
  container.querySelectorAll('input[name]:not([type="radio"]), textarea[name], select[name]').forEach((el) => {
    if (!el.value.trim()) {
      const wrap = el.closest('.q-field') || el.closest('.field');
      if (wrap && !wrap.classList.contains('field-invalid')) {
        wrap.classList.add('field-invalid');
        count++;
      }
    }
  });

  // Grupos de radio: marcar si ninguno está seleccionado
  const seen = new Set();
  container.querySelectorAll('input[type="radio"][name]').forEach((radio) => {
    if (seen.has(radio.name)) return;
    seen.add(radio.name);
    const group = container.querySelectorAll(`input[type="radio"][name="${CSS.escape(radio.name)}"]`);
    if (!Array.from(group).some((r) => r.checked)) {
      const wrap = radio.closest('.q-field') || radio.closest('.field');
      if (wrap && !wrap.classList.contains('field-invalid')) {
        wrap.classList.add('field-invalid');
        count++;
      }
    }
  });

  // Banner de advertencia
  let banner = document.getElementById('q-incomplete-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'q-incomplete-banner';
    banner.className = 'q-incomplete-banner';
    banner.innerHTML = '<span class="q-banner-msg"></span>'
      + '<button type="button" class="q-banner-close" title="Cerrar">✕</button>';
    banner.querySelector('.q-banner-close').addEventListener('click', () => { banner.hidden = true; });
    container.insertBefore(banner, container.firstChild);
  }

  if (count > 0) {
    banner.querySelector('.q-banner-msg').textContent =
      `⚠️ Hay ${count} campo(s) sin completar. El cuestionario se guardó de todas formas.`;
    banner.hidden = false;
    container.querySelector('.field-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    banner.hidden = true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}
