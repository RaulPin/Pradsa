'use strict';

// ─── Estado de la aplicación ──────────────────────────────────────────────────
let currentUser  = null;
let interviews   = [];
let filterStatus = '';
let filterType   = '';
let searchQuery  = '';
let searchTimer  = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const me = await api('/api/auth/me');
    currentUser = me;

    // Si aún requiere cambio de contraseña
    if (me.first_login) {
      window.location.replace('/login');
      return;
    }

    // Poblar navbar
    document.getElementById('nav-name').textContent = me.name;
    const roleBadge = document.getElementById('nav-role');
    roleBadge.textContent = me.role === 'admin' ? 'Admin' : 'Usuario';
    roleBadge.className = `badge badge-${me.role}`;

    // Avatar con iniciales
    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl && me.name) {
      const parts = me.name.trim().split(' ');
      avatarEl.textContent = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    }

    // Advertencia de expiración de contraseña
    if (me.password_expires_at) {
      const daysLeft = Math.ceil((new Date(me.password_expires_at) - Date.now()) / 86400000);
      if (daysLeft <= 15) {
        const banner = document.getElementById('pw-expiry-banner');
        banner.hidden = false;
        if (daysLeft <= 0) {
          banner.textContent = '⚠️ Tu contraseña ha vencido. Deberás cambiarla en tu próximo inicio de sesión.';
          banner.classList.add('pw-expiry-critical');
        } else {
          banner.textContent = `⚠️ Tu contraseña vencerá en ${daysLeft} día(s). Cámbiala pronto para evitar interrupciones.`;
        }
      }
    }

    // Mostrar tabs de admin
    if (me.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach((el) => { el.hidden = false; });
    }

    await loadInterviews();
    initTabs();
    initFilters();
    initNewInterviewForm();
    initUserManagement();
    initAudit();
    if (me.role === 'admin') checkPurgeAlert();

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.replace('/login');
    });
  } catch {
    window.location.replace('/login');
  }
})();

// ─── Navegación lateral ───────────────────────────────────────────────────────
const TAB_TITLES = {
  'interviews':    'Entrevistas',
  'new-interview': 'Nueva entrevista',
  'users':         'Gestión de usuarios',
  'kpi':           'Reportes KPI',
  'audit':         'Log de auditoría',
};

function initTabs() {
  document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((s) => s.classList.remove('visible'));
      item.classList.add('active');
      const target = document.getElementById(`tab-${item.dataset.tab}`);
      if (target) target.classList.add('visible');

      // Actualizar título del topbar
      const titleEl = document.getElementById('topbar-title');
      if (titleEl) titleEl.textContent = TAB_TITLES[item.dataset.tab] || '';

      if (item.dataset.tab === 'users' && currentUser?.role === 'admin') loadUsers();
      if (item.dataset.tab === 'audit' && currentUser?.role === 'admin') loadAuditLogs();
      if (item.dataset.tab === 'kpi'   && currentUser?.role === 'admin') loadKpiSummary();
    });
  });

  // Activar primer item
  document.querySelector('.nav-item[data-tab]')?.click();
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
function initFilters() {
  document.getElementById('filter-status').addEventListener('change', (e) => {
    filterStatus = e.target.value;
    loadInterviews();
  });
  document.getElementById('filter-type').addEventListener('change', (e) => {
    filterType = e.target.value;
    loadInterviews();
  });
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      loadInterviews();
    }, 350);
  });
}

// ─── Entrevistas ──────────────────────────────────────────────────────────────
async function loadInterviews() {
  try {
    const params = new URLSearchParams();
    if (searchQuery)  params.set('q',      searchQuery);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType)   params.set('type',   filterType);
    const qs = params.toString() ? `?${params}` : '';
    interviews = await api(`/api/interviews${qs}`);
    renderInterviews();

    if (currentUser?.role === 'admin') loadStats();
  } catch (err) {
    console.error('Error cargando entrevistas', err);
  }
}

async function loadStats() {
  try {
    const stats = await api('/api/interviews/stats');
    const statsRow = document.getElementById('stats-row');
    statsRow.innerHTML = `
      <div class="stat-card"><div class="stat-num">${stats.total}</div><div class="stat-label">Total</div></div>
      ${(stats.byStatus || []).map((s) => `
        <div class="stat-card">
          <div class="stat-num">${s.count}</div>
          <div class="stat-label">${statusLabel(s.status)}</div>
        </div>
      `).join('')}
    `;
    statsRow.hidden = false;
  } catch {}
}

function renderInterviews() {
  const list = document.getElementById('interviews-list');

  if (!interviews.length) {
    list.innerHTML = '<p class="muted" style="padding:.5rem 0">No hay entrevistas para mostrar.</p>';
    return;
  }

  list.innerHTML = interviews.map((i) => `    <div class="interview-card">
      <div class="ic-main">
        <div class="ic-header-row">
          ${i.folio ? `<span class="ic-folio">${esc(i.folio)}</span>` : ''}
          <div class="ic-title">${esc(i.title)}</div>
        </div>
        <div class="ic-meta">
          <span class="badge badge-${i.type}">${i.type === 'pyme' ? 'Pyme' : 'Fiduciario'}</span>
          <span class="badge badge-${i.status}">${statusLabel(i.status)}</span>
        </div>
        <div class="ic-info">
          📅 ${fmtDate(i.scheduled_at)} &nbsp;·&nbsp;
          👤 ${esc(i.interviewee_name)} &nbsp;·&nbsp;
          📷 ${i.photo_count || 0} foto(s)
          ${i.interviewer_name ? `&nbsp;·&nbsp; 🎙 ${esc(i.interviewer_name)}` : ''}
        </div>
      </div>
      <div class="ic-actions">
        ${i.status === 'scheduled' || i.status === 'in_progress'
          ? `<a href="/interview?id=${i.id}" class="btn btn-sm btn-primary">Iniciar</a>`
          : `<a href="/interview?id=${i.id}" class="btn btn-sm btn-ghost">Sala</a>`
        }
        ${i.join_token && (i.status === 'scheduled' || i.status === 'in_progress') ? `
          <button class="btn btn-sm btn-ghost btn-copy-link" data-token="${esc(i.join_token)}" title="Copiar enlace de invitación">
            🔗 Enlace
          </button>
          ${waCardButton(i)}` : ''}
        <a href="/expediente?id=${i.id}" class="btn btn-sm btn-ghost" title="Ver expediente completo">📁 Expediente</a>
        ${currentUser?.role === 'admin' && (i.status === 'completed' || i.status === 'cancelled')
          ? `<button class="btn btn-sm btn-ghost btn-delete-interview" data-id="${i.id}" data-title="${esc(i.title)}" style="color:#ef4444;border-color:#ef4444" title="Eliminar entrevista">🗑</button>`
          : ''}
      </div>
    </div>
  `).join('');

  // Copiar enlace de invitación
  list.querySelectorAll('.btn-copy-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const token = btn.dataset.token;
      const url   = `${location.origin}/join?token=${token}`;
      navigator.clipboard.writeText(url).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copiado';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    });
  });

  // Eliminar entrevista (solo admin, solo completadas/canceladas)
  list.querySelectorAll('.btn-delete-interview').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const title = btn.dataset.title;
      if (!confirm(`¿Eliminar la entrevista "${title}"?\n\nSe borrarán permanentemente todos sus datos: fotos, sesión, cuestionario y grabación. Esta acción no se puede deshacer.`)) return;
      btn.disabled = true;
      try {
        const resp = await fetch(`/api/interviews/${btn.dataset.id}`, { method: 'DELETE' });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          alert(err.error || 'Error al eliminar la entrevista.');
          btn.disabled = false;
          return;
        }
        btn.closest('.interview-card').remove();
        if (!list.querySelector('.interview-card')) {
          list.innerHTML = '<p class="muted" style="padding:.5rem 0">No hay entrevistas para mostrar.</p>';
        }
        if (currentUser?.role === 'admin') loadStats();
      } catch {
        alert('Error de red. Intenta de nuevo.');
        btn.disabled = false;
      }
    });
  });
}

// ─── Nueva entrevista ──────────────────────────────────────────────────────────
function initNewInterviewForm() {
  const form       = document.getElementById('interview-form');
  const errEl      = document.getElementById('create-error');
  const successEl  = document.getElementById('create-success');
  const createdBox = document.getElementById('created-box');
  const btnCreate  = document.getElementById('btn-create');
  const joinLinkEl = document.getElementById('join-link');
  const btnCopy    = document.getElementById('btn-copy');
  const btnAnother = document.getElementById('btn-another');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAlert(errEl, null);
    setAlert(successEl, null);

    const ok = validateFields([
      { el: document.getElementById('int-title'), label: 'El título' },
      { el: document.getElementById('int-type'),  label: 'El tipo',
        check: (el) => !!el.value },
      { el: document.getElementById('int-date'),  label: 'La fecha y hora' },
      { el: document.getElementById('int-name'),  label: 'El nombre del entrevistado' },
      { el: document.getElementById('int-email'), label: 'El correo',
        check: (el) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()) },
    ]);
    if (!ok) {
      setAlert(errEl, 'Completa los campos obligatorios antes de continuar.');
      return;
    }

    setLoading(btnCreate, true, 'Creando…');

    const body = {
      title:             document.getElementById('int-title').value.trim(),
      type:              document.getElementById('int-type').value,
      scheduledAt:       document.getElementById('int-date').value,
      intervieweeName:   document.getElementById('int-name').value.trim(),
      intervieweeEmail:  document.getElementById('int-email').value.trim(),
      intervieweePhone:  document.getElementById('int-phone').value.trim(),
      intervieweeAddress: document.getElementById('int-address').value.trim(),
    };

    try {
      const res  = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setAlert(errEl, data.error || 'Error al crear la entrevista');
        return;
      }

      const joinUrl  = data.interview.joinUrl || '';
      const waPhone  = formatWaPhone(body.intervieweePhone);

      form.reset();
      form.hidden = true;
      createdBox.hidden = false;
      joinLinkEl.value = joinUrl;

      // Botón WhatsApp
      const waBtn    = document.getElementById('btn-whatsapp-create');
      const waNoPhone = document.getElementById('wa-no-phone');
      if (waPhone) {
        const waText = buildWaMessage(body.intervieweeName, body.title, body.scheduledAt, joinUrl);
        waBtn.href   = `https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`;
        waBtn.hidden = false;
        waNoPhone.style.display = 'none';
      } else {
        waBtn.hidden = true;
        waNoPhone.style.display = '';
      }

      if (data.warning) setAlert(errEl, data.warning);
      else setAlert(successEl, data.message || 'Entrevista creada.');

      // Recargar lista
      await loadInterviews();
    } catch {
      setAlert(errEl, 'Error de red. Intenta nuevamente.');
    } finally {
      setLoading(btnCreate, false, 'Crear y enviar invitación');
    }
  });

  btnCopy?.addEventListener('click', () => {
    navigator.clipboard.writeText(joinLinkEl.value).then(() => {
      btnCopy.textContent = '✓';
      setTimeout(() => { btnCopy.textContent = 'Copiar'; }, 2000);
    });
  });

  btnAnother?.addEventListener('click', () => {
    form.hidden = false;
    createdBox.hidden = true;
    setAlert(errEl, null);
    setAlert(successEl, null);
  });
}

// ─── Gestión de usuarios (admin) ──────────────────────────────────────────────
function initUserManagement() {
  if (currentUser?.role !== 'admin') return;

  const btnShow   = document.getElementById('btn-show-create-user');
  const formBox   = document.getElementById('user-form-box');
  const userForm  = document.getElementById('user-form');
  const btnCancel = document.getElementById('btn-cancel-user');
  const errEl     = document.getElementById('user-error');
  const successEl = document.getElementById('user-success');
  const tempBox   = document.getElementById('temp-pw-box');
  const tempPwEl  = document.getElementById('temp-pw-display');
  const btnSave   = document.getElementById('btn-save-user');

  btnShow.addEventListener('click', () => {
    formBox.hidden = !formBox.hidden;
    if (!formBox.hidden) { userForm.reset(); setAlert(errEl, null); setAlert(successEl, null); tempBox.hidden = true; }
  });

  btnCancel.addEventListener('click', () => { formBox.hidden = true; });

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAlert(errEl, null);
    setAlert(successEl, null);

    const ok = validateFields([
      { el: document.getElementById('usr-name'),  label: 'El nombre' },
      { el: document.getElementById('usr-email'), label: 'El correo',
        check: (el) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()) },
      { el: document.getElementById('usr-role'),  label: 'El rol',
        check: (el) => !!el.value },
    ]);
    if (!ok) {
      setAlert(errEl, 'Completa los campos obligatorios antes de continuar.');
      return;
    }

    setLoading(btnSave, true, 'Creando…');

    const body = {
      name:  document.getElementById('usr-name').value.trim(),
      email: document.getElementById('usr-email').value.trim(),
      role:  document.getElementById('usr-role').value,
    };

    try {
      const res  = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) { setAlert(errEl, data.error || 'Error al crear usuario'); return; }

      setAlert(successEl, data.message || 'Usuario creado correctamente');
      userForm.reset();
      if (data.tempPassword) {
        tempPwEl.textContent = data.tempPassword;
        tempBox.hidden = false;
      }
      loadUsers();
    } catch {
      setAlert(errEl, 'Error de red.');
    } finally {
      setLoading(btnSave, false, 'Crear usuario');
    }
  });
}

async function loadUsers() {
  if (currentUser?.role !== 'admin') return;
  try {
    const users = await api('/api/users');
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><span class="badge badge-${u.role}">${u.role === 'admin' ? 'Admin' : 'Usuario'}</span></td>
        <td>
          ${u.active ? '<span style="color:var(--success)">Activo</span>' : '<span style="color:var(--danger)">Inactivo</span>'}
          ${u.locked_until && new Date(u.locked_until) > new Date() ? ' 🔒' : ''}
        </td>
        <td>${u.last_login ? fmtDate(u.last_login) : '—'}</td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
          ${u.locked_until && new Date(u.locked_until) > new Date()
            ? `<button class="btn btn-sm btn-ghost" onclick="unlockUser('${u.id}')">Desbloquear</button>`
            : ''
          }
          <button class="btn btn-sm btn-ghost" onclick="toggleUserActive('${u.id}', ${u.active})">
            ${u.active ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

async function unlockUser(id) {
  await fetch(`/api/users/${id}/unlock`, { method: 'POST' });
  loadUsers();
}

async function toggleUserActive(id, currentActive) {
  await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !currentActive }),
  });
  loadUsers();
}

// Exponer globales para onclick inline
window.unlockUser = unlockUser;
window.toggleUserActive = toggleUserActive;

// ─── Auditoría ────────────────────────────────────────────────────────────────
function initAudit() {
  document.getElementById('audit-filter')?.addEventListener('change', (e) => {
    loadAuditLogs(e.target.value);
  });
}

async function loadAuditLogs(action = '') {
  if (currentUser?.role !== 'admin') return;
  try {
    const url = action ? `/api/users/audit-logs?action=${action}&limit=200` : '/api/users/audit-logs?limit=200';
    const logs = await api(url);
    const tbody = document.getElementById('audit-tbody');
    tbody.innerHTML = logs.map((l) => `
      <tr>
        <td style="white-space:nowrap;font-size:.8rem;">${fmtDate(l.created_at)}</td>
        <td>${l.user_name ? esc(l.user_name) : '<span class="muted">—</span>'}</td>
        <td><code style="font-size:.8rem;">${esc(l.action)}</code></td>
        <td>${l.ip ? esc(l.ip) : '—'}</td>
        <td style="font-size:.78rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;">${l.details ? esc(l.details) : '—'}</td>
      </tr>
    `).join('');
  } catch (err) { console.error(err); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function api(url) {
  const res = await fetch(url);
  if (res.status === 401) { window.location.replace('/login'); return null; }
  if (!res.ok) { throw new Error(`API error ${res.status}`); }
  return res.json();
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) { window.location.replace('/login'); return null; }
  if (!res.ok) { throw new Error(`API error ${res.status}`); }
  return res.json();
}

function setAlert(el, msg) {
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = msg; el.hidden = false;
}

// Validates an array of {el, label, check?} descriptors.
// Marks each empty field red and returns false if any fail.
// check(el) → bool (optional, defaults to non-empty value)
function validateFields(fieldDefs) {
  let valid = true;
  fieldDefs.forEach(({ el, label, check }) => {
    const fieldWrap = el.closest('.field');
    const failed = check ? !check(el) : !el.value.trim();
    if (fieldWrap) {
      fieldWrap.classList.toggle('field-invalid', failed);
      // Show/remove inline hint
      let hint = fieldWrap.querySelector('.field-hint');
      if (failed) {
        if (!hint) { hint = document.createElement('span'); hint.className = 'field-hint'; fieldWrap.appendChild(hint); }
        hint.textContent = `${label} es obligatorio.`;
      } else if (hint) {
        hint.remove();
      }
      // Clear invalid state as soon as the user starts correcting
      if (failed) {
        const clear = () => {
          fieldWrap.classList.remove('field-invalid');
          fieldWrap.querySelector('.field-hint')?.remove();
        };
        el.addEventListener('input',  clear, { once: true });
        el.addEventListener('change', clear, { once: true });
      }
    }
    if (failed) valid = false;
  });
  return valid;
}

function setLoading(btn, loading, text) {
  if (!btn) return;
  btn.disabled = loading; btn.textContent = text;
}

function statusLabel(s) {
  return { scheduled: 'Programada', in_progress: 'En curso', completed: 'Completada', cancelled: 'Cancelada' }[s] || s;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ─── WhatsApp helpers ─────────────────────────────────────────────────────────

// Normaliza el teléfono para wa.me (solo dígitos; añade 52 si son 10 dígitos mexicanos)
function formatWaPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `52${digits}` : digits;
}

// Construye el mensaje de WhatsApp pre-llenado
function buildWaMessage(name, title, scheduledAt, url) {
  const dateStr = scheduledAt
    ? new Date(scheduledAt).toLocaleString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long',
        year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';
  return `Hola *${name}*, has sido invitado/a a una entrevista de crédito con FieldCheck.\n\n`
    + `📋 *${title}*\n`
    + (dateStr ? `📅 ${dateStr}\n\n` : '\n')
    + `🔗 Enlace de acceso:\n${url}\n\n`
    + `_Para participar deberás permitir acceso a tu cámara, micrófono y ubicación GPS._`;
}

// Genera el botón WhatsApp para las tarjetas de entrevista
function waCardButton(interview) {
  const phone = formatWaPhone(interview.interviewee_phone);
  if (!phone || !interview.join_token) return '';
  const url = `${location.origin}/join?token=${interview.join_token}`;
  const msg = buildWaMessage(interview.interviewee_name, interview.title, interview.scheduled_at, url);
  return `<a class="btn btn-sm btn-whatsapp" target="_blank" rel="noopener noreferrer"
    href="https://wa.me/${phone}?text=${encodeURIComponent(msg)}" title="Enviar enlace por WhatsApp">
    📱 WA
  </a>`;
}

// ─── KPI Summary ─────────────────────────────────────────────────────────────
async function loadKpiSummary() {
  try {
    const data = await apiFetch('/api/interviews/kpi-summary');
    document.getElementById('kpi-val-total').textContent       = data.total       ?? '—';
    document.getElementById('kpi-val-completadas').textContent = data.completadas  ?? '—';
    document.getElementById('kpi-val-canceladas').textContent  = data.canceladas   ?? '—';
    document.getElementById('kpi-val-tasa').textContent        = data.tasa         ?? '—';
    document.getElementById('kpi-val-duracion').textContent    = data.duracion     ?? '—';
    document.getElementById('kpi-val-fotos').textContent       = data.fotos        ?? '—';
  } catch { /* silencioso */ }
}

document.getElementById('btn-download-kpi')?.addEventListener('click', () => {
  window.location.href = '/report/kpi/excel';
});

// ─── Purga de registros antiguos ─────────────────────────────────────────────
async function checkPurgeAlert() {
  try {
    const data = await apiFetch('/report/kpi/purge-summary');
    if (data && data.interviews > 0) {
      const banner = document.getElementById('purge-alert-banner');
      if (banner) banner.hidden = false;
    }
  } catch { /* silencioso */ }
}

(function initPurge() {
  const modal   = document.getElementById('purge-modal');
  const summary = document.getElementById('purge-summary');

  document.getElementById('btn-purge-open')?.addEventListener('click', async () => {
    summary.textContent = 'Calculando…';
    modal.style.display = 'flex';
    try {
      const data = await apiFetch('/report/kpi/purge-summary');
      if (data.interviews === 0) {
        summary.innerHTML = '<em>No hay registros con más de 3 meses de antigüedad.</em>';
        return;
      }
      const cutDate = new Date(data.cutoff).toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
      summary.innerHTML = `
        <strong>Registros anteriores al ${cutDate}:</strong><br>
        • Entrevistas: <b>${data.interviews}</b><br>
        • Fotos (archivos): <b>${data.photos}</b><br>
        • Sesiones: <b>${data.sessions}</b><br>
        • Cuestionarios: <b>${data.questionnaires}</b>
      `;
    } catch {
      summary.textContent = 'Error al obtener resumen.';
    }
  });

  document.getElementById('btn-purge-cancel')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('btn-purge-confirm')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-purge-confirm');
    btn.disabled = true;
    btn.textContent = 'Eliminando…';
    try {
      const resp = await fetch('/report/kpi/purge', { method: 'DELETE' });
      if (resp.status === 401) { window.location.replace('/login'); return; }
      if (!resp.ok) throw new Error(`Error ${resp.status}`);

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('spreadsheet') || contentType.includes('octet-stream')) {
        // La purga tuvo éxito → descargar informe Excel
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const cd = resp.headers.get('content-disposition') || '';
        const match = cd.match(/filename="([^"]+)"/);
        a.download = match ? match[1] : `Purga_FieldCheck_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        modal.style.display = 'none';
        // Ocultar banner de alerta
        const banner = document.getElementById('purge-alert-banner');
        if (banner) banner.hidden = true;
        loadKpiSummary();
      } else {
        // JSON → sin registros para purgar
        const data = await resp.json();
        modal.style.display = 'none';
        alert(data.message || 'Sin registros para purgar.');
      }
    } catch {
      alert('Error al purgar registros. Intenta de nuevo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Eliminar permanentemente';
    }
  });
})();
