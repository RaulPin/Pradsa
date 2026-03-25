'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const S = {
  token:           localStorage.getItem('pradsa_token') || null,
  user:            JSON.parse(localStorage.getItem('pradsa_user') || 'null'),
  locationInterval: null,
  currentPage:     'home',
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (S.token) opts.headers['Authorization'] = `Bearer ${S.token}`;
  if (body)    opts.body = JSON.stringify(body);
  const res  = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function saveAuth(token, user) {
  S.token = token; S.user = user;
  localStorage.setItem('pradsa_token', token);
  localStorage.setItem('pradsa_user', JSON.stringify(user));
}

function clearAuth() {
  S.token = null; S.user = null;
  localStorage.removeItem('pradsa_token');
  localStorage.removeItem('pradsa_user');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const initials = n => (n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();

function formatTime(d) {
  if (!d) return null;
  return new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function calcElapsed(from) {
  if (!from) return null;
  const diff = Date.now() - new Date(from);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function calcTotal(from, to) {
  if (!from || !to) return null;
  const diff = new Date(to) - new Date(from);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

const PRIORITY_LABEL = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
const STATUS_LABEL   = { pending: 'Pendiente', in_progress: 'En progreso', completed: 'Completada', cancelled: 'Cancelada' };

// ─── Geolocation ──────────────────────────────────────────────────────────────

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no disponible en este dispositivo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('No se pudo obtener la ubicación')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

async function sendLocation() {
  try {
    const pos = await getPosition();
    await api('POST', '/location', pos);
  } catch (err) {
    console.warn('[Pradsa] Location update failed:', err.message);
  }
}

function startTracking() {
  if (S.locationInterval) return;
  sendLocation(); // immediate first send
  S.locationInterval = setInterval(sendLocation, 5 * 60 * 1000); // every 5 min
  updateTrackingUI(true);
}

function stopTracking() {
  if (S.locationInterval) {
    clearInterval(S.locationInterval);
    S.locationInterval = null;
  }
  updateTrackingUI(false);
}

function updateTrackingUI(active) {
  const el = document.getElementById('tracking-badge');
  if (!el) return;
  el.style.display = active ? '' : 'none';
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(page) {
  S.currentPage = page;
  document.querySelectorAll('.tab-bar__item').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );
  const content = document.getElementById('page-content');
  if (!content) return;
  switch (page) {
    case 'home':    pageHome(content);    break;
    case 'tasks':   pageTasks(content);   break;
    case 'profile': pageProfile(content); break;
  }
}

// ─── App Shell ────────────────────────────────────────────────────────────────

function renderShell() {
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      <div class="page-content" id="page-content">
        <div class="page-loader"><div class="spinner"></div></div>
      </div>
      <nav class="tab-bar">
        <button class="tab-bar__item active" data-page="home">
          <span class="tab-icon">🏠</span>
          <span class="tab-label">Inicio</span>
        </button>
        <button class="tab-bar__item" data-page="tasks">
          <span class="tab-icon">☑</span>
          <span class="tab-label">Tareas</span>
        </button>
        <button class="tab-bar__item" data-page="profile">
          <span class="tab-icon">👤</span>
          <span class="tab-label">Perfil</span>
        </button>
      </nav>
    </div>`;

  document.querySelectorAll('.tab-bar__item').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.page))
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function renderLogin() {
  stopTracking();
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">Pradsa</div>
        <p class="login-sub">Acceso para empleados</p>
        <div id="login-err"></div>
        <form id="login-form">
          <div class="form-group">
            <label>Correo electrónico</label>
            <input name="email" type="email" required autocomplete="email"
              placeholder="tucorreo@empresa.com" inputmode="email"/>
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input name="password" type="password" required autocomplete="current-password" placeholder="••••••"/>
          </div>
          <button type="submit" class="btn-primary-full" id="login-btn">Iniciar sesión</button>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn   = document.getElementById('login-btn');
    const errEl = document.getElementById('login-err');
    const fd    = new FormData(e.target);
    btn.disabled = true; btn.textContent = 'Iniciando…'; errEl.innerHTML = '';
    try {
      const d = await api('POST', '/auth/login', {
        email:    fd.get('email').trim(),
        password: fd.get('password'),
      });
      saveAuth(d.token, d.user);
      renderShell();
      navigate('home');
    } catch (err) {
      errEl.innerHTML = `<p class="field-err">${esc(err.message)}</p>`;
      btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  });
}

// ─── Home page ────────────────────────────────────────────────────────────────

async function pageHome(container) {
  container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
  try {
    const [attendance, tasks] = await Promise.all([
      api('GET', '/attendance/today'),
      api('GET', '/tasks'),
    ]);

    const clockedIn  = !!attendance.clock_in;
    const clockedOut = !!attendance.clock_out;
    const canIn      = !clockedIn;
    const canOut     = clockedIn && !clockedOut;

    const pendingTasks  = tasks.filter(t => t.status === 'pending');
    const inProgTasks   = tasks.filter(t => t.status === 'in_progress');
    const doneTasks     = tasks.filter(t => t.status === 'completed');
    const activeTasks   = [...inProgTasks, ...pendingTasks].slice(0, 4);

    // Status text / icon
    let statusIcon, statusClass, statusText;
    if (!clockedIn) {
      statusIcon = '○'; statusClass = 'att-out'; statusText = 'Sin registrar hoy';
    } else if (!clockedOut) {
      statusIcon = '●'; statusClass = 'att-in'; statusText = 'Jornada en curso';
    } else {
      statusIcon = '✓'; statusClass = 'att-done'; statusText = 'Jornada completada';
    }

    const greeting = (() => {
      const h = new Date().getHours();
      if (h < 12) return 'Buenos días';
      if (h < 19) return 'Buenas tardes';
      return 'Buenas noches';
    })();

    container.innerHTML = `
      <div class="home-page">
        <div class="home-header">
          <div class="home-greeting">
            <span>${greeting},</span>
            <strong>${esc(S.user?.name?.split(' ')[0] || 'Empleado')}</strong>
          </div>
          <div class="tracking-badge" id="tracking-badge" ${clockedIn && !clockedOut ? '' : 'style="display:none"'}>
            📍 Activo
          </div>
        </div>

        <!-- Attendance card -->
        <div class="card card--attendance">
          <div class="attendance-status">
            <div class="attendance-icon ${statusClass}">${statusIcon}</div>
            <div>
              <div class="attendance-label">${statusText}</div>
              ${clockedIn ? `
                <div class="attendance-time">
                  Entrada: <strong>${formatTime(attendance.clock_in)}</strong>
                  ${clockedOut ? ` &nbsp;·&nbsp; Salida: <strong>${formatTime(attendance.clock_out)}</strong>` : ''}
                </div>
                <div class="attendance-hours">
                  ${clockedOut
                    ? '⏱ ' + (calcTotal(attendance.clock_in, attendance.clock_out) || '—') + ' totales'
                    : '⏱ ' + (calcElapsed(attendance.clock_in) || '—') + ' en curso'}
                </div>` : ''}
            </div>
          </div>

          <div class="clock-buttons">
            ${canIn  ? `<button class="btn-clock btn-clock--in"  id="btn-clock-in">
              <span class="btn-clock__icon">🟢</span><span>Registrar entrada</span>
            </button>` : ''}
            ${canOut ? `<button class="btn-clock btn-clock--out" id="btn-clock-out">
              <span class="btn-clock__icon">🔴</span><span>Registrar salida</span>
            </button>` : ''}
            ${clockedOut ? `<div class="att-complete-msg">✅ Asistencia del día registrada</div>` : ''}
          </div>
        </div>

        <!-- Stats row -->
        <div class="cards-row">
          <div class="card card--mini">
            <div class="card-mini__val">${pendingTasks.length}</div>
            <div class="card-mini__lbl">Pendientes</div>
          </div>
          <div class="card card--mini">
            <div class="card-mini__val">${inProgTasks.length}</div>
            <div class="card-mini__lbl">En progreso</div>
          </div>
          <div class="card card--mini">
            <div class="card-mini__val">${doneTasks.length}</div>
            <div class="card-mini__lbl">Completadas</div>
          </div>
        </div>

        <!-- Active tasks preview -->
        ${activeTasks.length ? `
          <div class="section-title" style="padding:0 .125rem">Tareas activas</div>
          <div class="task-list">
            ${activeTasks.map(t => `
              <div class="task-item" data-page="tasks">
                <div class="task-priority priority--${t.priority}"></div>
                <div class="task-info">
                  <div class="task-title">${esc(t.title)}</div>
                  <div class="task-meta">
                    <span class="badge badge--${t.status}">${STATUS_LABEL[t.status] || t.status}</span>
                    <span class="badge badge--${t.priority}">${PRIORITY_LABEL[t.priority] || t.priority}</span>
                  </div>
                </div>
                <div class="task-arrow">›</div>
              </div>`).join('')}
          </div>` : ''}
      </div>`;

    // Clock-in handler
    document.getElementById('btn-clock-in')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-clock-in');
      btn.disabled = true;
      btn.querySelector('span:last-child').textContent = 'Obteniendo ubicación…';
      try {
        let coords = {};
        try { coords = await getPosition(); } catch { /* location optional */ }
        await api('POST', '/attendance/clock-in', coords);
        startTracking();
        toast('✅ Entrada registrada');
        pageHome(container);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.querySelector('span:last-child').textContent = 'Registrar entrada';
      }
    });

    // Clock-out handler
    document.getElementById('btn-clock-out')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-clock-out');
      btn.disabled = true;
      btn.querySelector('span:last-child').textContent = 'Obteniendo ubicación…';
      try {
        let coords = {};
        try { coords = await getPosition(); } catch { /* location optional */ }
        await api('POST', '/attendance/clock-out', coords);
        stopTracking();
        toast('✅ Salida registrada');
        pageHome(container);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.querySelector('span:last-child').textContent = 'Registrar salida';
      }
    });

    // Task items → go to tasks tab
    container.querySelectorAll('.task-item').forEach(el =>
      el.addEventListener('click', () => navigate('tasks'))
    );

    // Resume tracking if already clocked in today
    if (clockedIn && !clockedOut && !S.locationInterval) startTracking();

  } catch (err) {
    container.innerHTML = `<div class="error-card">${esc(err.message)}</div>`;
  }
}

// ─── Tasks page ───────────────────────────────────────────────────────────────

async function pageTasks(container) {
  container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
  try {
    const tasks = await api('GET', '/tasks');
    let filter = 'active';

    function render() {
      const list = filter === 'active'
        ? tasks.filter(t => t.status === 'pending' || t.status === 'in_progress')
        : tasks;

      const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

      container.innerHTML = `
        <div class="tasks-page">
          <div class="filter-tabs">
            <button class="filter-tab ${filter === 'active' ? 'active' : ''}" data-f="active">
              Activas (${activeCount})
            </button>
            <button class="filter-tab ${filter === 'all' ? 'active' : ''}" data-f="all">
              Todas (${tasks.length})
            </button>
          </div>
          ${list.length ? list.map(t => `
            <div class="task-card">
              <div class="task-card__header">
                <span class="badge badge--${t.priority}">${PRIORITY_LABEL[t.priority] || t.priority}</span>
                <span class="badge badge--${t.status}">${STATUS_LABEL[t.status] || t.status}</span>
              </div>
              <div class="task-card__title">${esc(t.title)}</div>
              ${t.description ? `<div class="task-card__desc">${esc(t.description)}</div>` : ''}
              ${t.due_date ? `<div class="task-card__meta">📅 ${new Date(t.due_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</div>` : ''}
              ${t.location_name ? `<div class="task-card__meta">📍 ${esc(t.location_name)}</div>` : ''}
              ${t.status !== 'completed' && t.status !== 'cancelled' ? `
                <div class="task-card__actions">
                  ${t.status === 'pending'
                    ? `<button class="btn-task" data-id="${t.id}" data-status="in_progress">▶ Iniciar tarea</button>`
                    : `<button class="btn-task btn-task--done" data-id="${t.id}" data-status="completed">✓ Marcar como completada</button>`}
                </div>` : ''}
            </div>`).join('') : `<div class="empty-state">No hay tareas ${filter === 'active' ? 'activas' : ''} asignadas</div>`}
        </div>`;

      container.querySelectorAll('.filter-tab').forEach(b =>
        b.addEventListener('click', () => { filter = b.dataset.f; render(); })
      );

      container.querySelectorAll('.btn-task').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const id     = parseInt(btn.dataset.id, 10);
          const status = btn.dataset.status;
          btn.disabled = true; btn.textContent = 'Guardando…';
          try {
            let coords = {};
            try { coords = await getPosition(); } catch { /* optional */ }
            await api('PUT', `/tasks/${id}`, {
              status,
              lat: coords.lat,
              lng: coords.lng,
            });
            toast(status === 'in_progress' ? '▶ Tarea iniciada' : '✅ Tarea completada');
            pageTasks(container);
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    }

    render();
  } catch (err) {
    container.innerHTML = `<div class="error-card">${esc(err.message)}</div>`;
  }
}

// ─── Profile page ─────────────────────────────────────────────────────────────

async function pageProfile(container) {
  container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
  try {
    const me = await api('GET', '/auth/me');

    container.innerHTML = `
      <div class="profile-page">
        <div class="profile-avatar">${initials(me.name)}</div>
        <div class="profile-name">${esc(me.name)}</div>
        <div class="profile-email">${esc(me.email)}</div>

        <div class="profile-card">
          ${me.employee?.position     ? `<div class="profile-field"><span>Puesto</span><strong>${esc(me.employee.position)}</strong></div>` : ''}
          ${me.employee?.department   ? `<div class="profile-field"><span>Departamento</span><strong>${esc(me.employee.department)}</strong></div>` : ''}
          ${me.employee?.employee_code ? `<div class="profile-field"><span>Código</span><strong>${esc(me.employee.employee_code)}</strong></div>` : ''}
          ${me.employee?.hire_date    ? `<div class="profile-field"><span>Desde</span><strong>${new Date(me.employee.hire_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></div>` : ''}
          <div class="profile-field"><span>Estado ubicación</span><strong>${S.locationInterval ? '📍 Activa' : '⏸ Inactiva'}</strong></div>
        </div>

        <!-- Change password -->
        <div id="pwd-section">
          <button class="btn-outline" id="show-pwd">🔑 Cambiar contraseña</button>
        </div>
        <div id="pwd-form" style="display:none">
          <div class="pwd-fields">
            <div class="form-group">
              <label>Contraseña actual</label>
              <input type="password" id="pwd-current" placeholder="Contraseña actual" autocomplete="current-password"/>
            </div>
            <div class="form-group">
              <label>Nueva contraseña</label>
              <input type="password" id="pwd-new" placeholder="Mínimo 6 caracteres" autocomplete="new-password"/>
            </div>
          </div>
          <div id="pwd-err"></div>
          <button class="btn-primary-full" id="pwd-save">Guardar contraseña</button>
          <button class="btn-outline" id="pwd-cancel" style="margin-top:.5rem">Cancelar</button>
        </div>

        <button class="btn-logout" id="logout-btn">Cerrar sesión</button>
      </div>`;

    // Toggle password form
    document.getElementById('show-pwd').addEventListener('click', () => {
      document.getElementById('pwd-section').style.display = 'none';
      document.getElementById('pwd-form').style.display = '';
    });
    document.getElementById('pwd-cancel').addEventListener('click', () => {
      document.getElementById('pwd-form').style.display = 'none';
      document.getElementById('pwd-section').style.display = '';
    });

    // Save password
    document.getElementById('pwd-save').addEventListener('click', async () => {
      const cur   = document.getElementById('pwd-current').value;
      const nw    = document.getElementById('pwd-new').value;
      const errEl = document.getElementById('pwd-err');
      errEl.innerHTML = '';
      if (!cur || !nw) { errEl.innerHTML = '<p class="field-err">Completa ambos campos</p>'; return; }
      if (nw.length < 6) { errEl.innerHTML = '<p class="field-err">La contraseña debe tener al menos 6 caracteres</p>'; return; }
      try {
        await api('POST', '/auth/change-password', { current_password: cur, new_password: nw });
        toast('✅ Contraseña actualizada');
        document.getElementById('pwd-form').style.display = 'none';
        document.getElementById('pwd-section').style.display = '';
        document.getElementById('pwd-current').value = '';
        document.getElementById('pwd-new').value = '';
      } catch (err) {
        errEl.innerHTML = `<p class="field-err">${esc(err.message)}</p>`;
      }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      stopTracking();
      clearAuth();
      renderLogin();
    });

  } catch (err) {
    container.innerHTML = `<div class="error-card">${esc(err.message)}</div>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  if (!S.token) { renderLogin(); return; }
  renderShell();
  navigate('home');
})();
