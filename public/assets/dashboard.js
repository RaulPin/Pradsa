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

  list.innerHTML = interviews.map((i) => `
    <div class="interview-card">
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
        <a href="/expediente?id=${i.id}" class="btn btn-sm btn-ghost" title="Ver expediente completo">📁 Expediente</a>
      </div>
    </div>
  `).join('');
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

      form.reset();
      form.hidden = true;
      createdBox.hidden = false;
      joinLinkEl.value = data.interview.joinUrl || '';

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

function setAlert(el, msg) {
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = msg; el.hidden = false;
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
