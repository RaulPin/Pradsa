'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

const S = {
  token:       localStorage.getItem('pradsa_token') || null,
  user:        JSON.parse(localStorage.getItem('pradsa_user') || 'null'),
  map:         null,
  markers:     {},
  mapInterval: null,
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (S.token) opts.headers['Authorization'] = `Bearer ${S.token}`;
  if (body)    opts.body = JSON.stringify(body);

  const res  = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

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
const initials = n => (n || '?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}
function formatTime(d) {
  if (!d) return null;
  return new Date(d).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
}
function timeAgo(d) {
  if (!d) return '—';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h/24)}d`;
}
function calcHours(ci, co) {
  if (!ci || !co) return '—';
  const diff = new Date(co) - new Date(ci);
  return `${Math.floor(diff/3600000)}h ${Math.floor((diff%3600000)/60000)}m`;
}

const PRIORITY_LABEL = { low:'Baja', medium:'Media', high:'Alta', urgent:'Urgente' };
const STATUS_LABEL   = { pending:'Pendiente', in_progress:'En progreso', completed:'Completada', cancelled:'Cancelada' };

// ─── Router ───────────────────────────────────────────────────────────────────

const PAGES = { dashboard: pageDashboard, employees: pageEmployees, tasks: pageTasks, map: pageMap, attendance: pageAttendance };
const PAGE_TITLES = { dashboard:'Dashboard', employees:'Empleados', tasks:'Tareas', map:'Mapa de empleados', attendance:'Asistencia' };

function navigate(page) {
  if (!S.token) { renderLogin(); return; }
  if (!PAGES[page]) page = 'dashboard';

  // Stop map polling when leaving the map page
  if (page !== 'map') stopMap();

  location.hash = page;

  document.querySelectorAll('.sidebar__nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page)
  );
  const h1 = document.querySelector('.topbar h1');
  if (h1) h1.textContent = PAGE_TITLES[page] || '';

  const content = document.getElementById('page-content');
  if (content) PAGES[page](content);
}

function stopMap() {
  if (S.mapInterval) { clearInterval(S.mapInterval); S.mapInterval = null; }
  if (S.map) { S.map.remove(); S.map = null; S.markers = {}; }
}

// ─── App Shell ────────────────────────────────────────────────────────────────

function renderShell() {
  document.getElementById('app').innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar__logo">
          <h2>Prad<span>sa</span></h2>
          <p>Panel de administración</p>
        </div>
        <ul class="sidebar__nav">
          <li><a href="#" data-page="dashboard"><span class="nav-icon">⊞</span>Dashboard</a></li>
          <li><a href="#" data-page="employees"><span class="nav-icon">👥</span>Empleados</a></li>
          <li><a href="#" data-page="tasks"><span class="nav-icon">☑</span>Tareas</a></li>
          <li><a href="#" data-page="map"><span class="nav-icon">📍</span>Mapa</a></li>
          <li><a href="#" data-page="attendance"><span class="nav-icon">📅</span>Asistencia</a></li>
        </ul>
        <div class="sidebar__footer">
          <div class="sidebar__user">
            <div class="avatar">${initials(S.user?.name)}</div>
            <div class="sidebar__user-info">
              <strong>${esc(S.user?.name)}</strong>
              <small>${esc(S.user?.role === 'admin' ? 'Administrador' : S.user?.role)}</small>
            </div>
            <button class="btn-icon" id="logout-btn" title="Cerrar sesión">⏻</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <h1>Dashboard</h1>
          <span class="topbar__date">${new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
        </div>
        <div class="page-content" id="page-content">
          <div class="loader"><div class="spinner"></div>Cargando...</div>
        </div>
      </div>
    </div>`;

  document.querySelectorAll('.sidebar__nav a').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); navigate(a.dataset.page); })
  );
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearAuth();
    renderLogin();
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────

function renderLogin() {
  stopMap();
  document.getElementById('app').innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-card__logo">Prad<span>sa</span></div>
        <p class="login-card__sub">Plataforma de monitoreo de personal</p>
        <div id="login-err"></div>
        <form id="login-form">
          <div class="form-group">
            <label for="le">Correo electrónico</label>
            <input id="le" name="email" type="email" required placeholder="admin@pradsa.com" autocomplete="email"/>
          </div>
          <div class="form-group">
            <label for="lp">Contraseña</label>
            <input id="lp" name="password" type="password" required placeholder="••••••" autocomplete="current-password"/>
          </div>
          <button type="submit" class="btn btn--primary" style="width:100%;justify-content:center" id="login-btn">
            Iniciar sesión
          </button>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-err');
    const fd = new FormData(e.target);
    btn.disabled = true; btn.textContent = 'Iniciando…'; errEl.innerHTML = '';
    try {
      const d = await api('POST', '/auth/login', { email: fd.get('email'), password: fd.get('password') });
      saveAuth(d.token, d.user);
      // Redirect employees to their mobile app
      if (d.user.role !== 'admin') {
        window.location.href = '/employee';
        return;
      }
      renderShell();
      navigate('dashboard');
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert--error">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function pageDashboard(container) {
  container.innerHTML = '<div class="loader"><div class="spinner"></div>Cargando...</div>';
  try {
    const [employees, tasks, locs] = await Promise.all([
      api('GET', '/employees'),
      api('GET', '/tasks'),
      api('GET', '/location/employees').catch(() => []),
    ]);

    const active   = employees.filter(e => e.active).length;
    const pending  = tasks.filter(t => t.status === 'pending').length;
    const inProg   = tasks.filter(t => t.status === 'in_progress').length;
    const today    = new Date().toDateString();
    const doneToday = tasks.filter(t => t.status === 'completed' && t.updated_at && new Date(t.updated_at).toDateString() === today).length;

    const recent = [...tasks].sort((a,b) => new Date(b.updated_at)-new Date(a.updated_at)).slice(0,8);

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card__icon ic-blue">👥</div><div><div class="stat-card__val">${active}</div><div class="stat-card__label">Empleados activos</div></div></div>
        <div class="stat-card"><div class="stat-card__icon ic-yellow">⏳</div><div><div class="stat-card__val">${pending}</div><div class="stat-card__label">Tareas pendientes</div></div></div>
        <div class="stat-card"><div class="stat-card__icon ic-blue">🔄</div><div><div class="stat-card__val">${inProg}</div><div class="stat-card__label">En progreso</div></div></div>
        <div class="stat-card"><div class="stat-card__icon ic-green">✅</div><div><div class="stat-card__val">${doneToday}</div><div class="stat-card__label">Completadas hoy</div></div></div>
      </div>
      <div class="dash-grid">
        <div class="panel">
          <div class="panel__header">
            <h2>Tareas recientes</h2>
            <button class="btn btn--ghost btn--sm" id="dash-go-tasks">Ver todas →</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Título</th><th>Asignado a</th><th>Prioridad</th><th>Estado</th><th>Actualizado</th></tr></thead>
              <tbody>
                ${recent.length ? recent.map(t => `
                  <tr>
                    <td><strong>${esc(t.title)}</strong></td>
                    <td class="muted">${esc(t.assigned_to_name || '—')}</td>
                    <td><span class="badge badge--${t.priority}">${PRIORITY_LABEL[t.priority]||t.priority}</span></td>
                    <td><span class="badge badge--${t.status}">${STATUS_LABEL[t.status]||t.status}</span></td>
                    <td class="muted">${timeAgo(t.updated_at)}</td>
                  </tr>`).join('') : '<tr><td colspan="5" class="table-empty">No hay tareas aún</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <div class="panel__header"><h2>Ubicaciones activas</h2></div>
          ${locs.length
            ? locs.map(l => `
              <div class="loc-item">
                <div class="avatar avatar--sm">${initials(l.name)}</div>
                <div class="loc-item__info">
                  <div class="loc-item__name">${esc(l.name)}</div>
                  <div class="loc-item__time">${timeAgo(l.updated_at)}</div>
                </div>
                <div class="online-dot"></div>
              </div>`).join('')
            : '<p class="muted" style="padding:1rem;font-size:.8125rem">Sin ubicaciones disponibles</p>'}
        </div>
      </div>`;

    document.getElementById('dash-go-tasks').addEventListener('click', () => navigate('tasks'));
  } catch (err) {
    container.innerHTML = `<div class="alert alert--error">${esc(err.message)}</div>`;
  }
}

// ─── Employees ────────────────────────────────────────────────────────────────

async function pageEmployees(container) {
  container.innerHTML = '<div class="loader"><div class="spinner"></div>Cargando...</div>';
  let employees = [], search = '';

  async function load() {
    employees = await api('GET', '/employees');
    render();
  }

  function filtered() {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter(e =>
      [e.name, e.email, e.department, e.position].some(v => (v||'').toLowerCase().includes(q))
    );
  }

  function render() {
    const list = filtered();
    container.innerHTML = `
      <div class="panel">
        <div class="panel__header">
          <h2>Empleados <span class="muted" style="font-weight:400">(${list.length})</span></h2>
          <div class="panel__toolbar">
            <input class="search-input" id="emp-search" placeholder="🔍 Buscar..." value="${esc(search)}"/>
            <button class="btn btn--primary" id="emp-new">+ Nuevo empleado</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Departamento</th><th>Puesto</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${list.length ? list.map(e => `
                <tr>
                  <td>
                    <div class="flex gap-2" style="align-items:center">
                      <div class="avatar avatar--sm">${initials(e.name)}</div>
                      <strong>${esc(e.name)}</strong>
                    </div>
                  </td>
                  <td class="muted">${esc(e.email)}</td>
                  <td class="muted">${esc(e.phone||'—')}</td>
                  <td>${esc(e.department||'—')}</td>
                  <td>${esc(e.position||'—')}</td>
                  <td><span class="badge badge--${e.active?'active':'inactive'}">${e.active?'Activo':'Inactivo'}</span></td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${e.id}">Editar</button>
                      <button class="btn btn--${e.active?'danger':'ghost'} btn--sm" data-action="toggle" data-id="${e.id}">
                        ${e.active?'Desactivar':'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>`).join('') : `<tr><td colspan="7" class="table-empty">No se encontraron empleados</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('emp-search').addEventListener('input', e => {
      search = e.target.value;
      const prev = e.target.selectionStart;
      render();
      const el = document.getElementById('emp-search');
      if (el) { el.focus(); el.setSelectionRange(prev, prev); }
    });
    document.getElementById('emp-new').addEventListener('click', () => modalEmployee(null, load));
    container.querySelectorAll('[data-action]').forEach(btn => {
      const emp = employees.find(e => e.id === +btn.dataset.id);
      if (btn.dataset.action === 'edit')   btn.addEventListener('click', () => modalEmployee(emp, load));
      if (btn.dataset.action === 'toggle') btn.addEventListener('click', () => toggleEmployee(emp, load));
    });
  }

  await load();
}

function modalEmployee(emp, onSave) {
  const isNew = !emp;
  const o = document.createElement('div');
  o.className = 'modal-overlay';
  o.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${isNew ? 'Nuevo empleado' : 'Editar empleado'}</h3>
        <button class="modal__close">✕</button>
      </div>
      <div class="modal__body">
        <div id="merr"></div>
        <form id="emp-form">
          <div class="form-row">
            <div class="form-group"><label>Nombre *</label><input name="name" required value="${esc(emp?.name||'')}"/></div>
            <div class="form-group"><label>Email *</label><input name="email" type="email" required value="${esc(emp?.email||'')}"${!isNew?' readonly':''}/></div>
          </div>
          ${isNew ? `
          <div class="form-row">
            <div class="form-group"><label>Contraseña *</label><input name="password" type="password" required minlength="6" placeholder="Mín. 6 caracteres"/></div>
            <div class="form-group"><label>Teléfono</label><input name="phone" type="tel"/></div>
          </div>` : `
          <div class="form-group"><label>Teléfono</label><input name="phone" type="tel" value="${esc(emp?.phone||'')}"/></div>`}
          <div class="form-row">
            <div class="form-group"><label>Departamento</label><input name="department" value="${esc(emp?.department||'')}"/></div>
            <div class="form-group"><label>Puesto</label><input name="position" value="${esc(emp?.position||'')}"/></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Código de empleado</label><input name="employee_code" value="${esc(emp?.employee_code||'')}"/></div>
            <div class="form-group"><label>Fecha de contratación</label><input name="hire_date" type="date" value="${emp?.hire_date?emp.hire_date.slice(0,10):''}"/></div>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" id="mcancel">Cancelar</button>
        <button class="btn btn--primary" id="msave">${isNew?'Crear empleado':'Guardar cambios'}</button>
      </div>
    </div>`;

  document.body.appendChild(o);
  const close = () => o.remove();
  o.querySelector('.modal__close').addEventListener('click', close);
  o.querySelector('#mcancel').addEventListener('click', close);
  o.addEventListener('click', e => { if (e.target === o) close(); });

  o.querySelector('#msave').addEventListener('click', async () => {
    const form = o.querySelector('#emp-form');
    const errEl = o.querySelector('#merr');
    const btn = o.querySelector('#msave');
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form));
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });

    btn.disabled = true; btn.textContent = 'Guardando…'; errEl.innerHTML = '';
    try {
      if (isNew) {
        await api('POST', '/employees', data);
        toast('Empleado creado');
      } else {
        await api('PUT', `/employees/${emp.id}`, data);
        toast('Empleado actualizado');
      }
      close(); onSave();
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert--error">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = isNew ? 'Crear empleado' : 'Guardar cambios';
    }
  });
}

async function toggleEmployee(emp, onDone) {
  const action = emp.active ? 'desactivar' : 'activar';
  if (!confirm(`¿${action.charAt(0).toUpperCase()+action.slice(1)} a ${emp.name}?`)) return;
  try {
    if (emp.active) await api('DELETE', `/employees/${emp.id}`);
    else            await api('PUT', `/employees/${emp.id}`, { active: 1 });
    toast(`Empleado ${emp.active ? 'desactivado' : 'activado'}`);
    onDone();
  } catch (err) { toast(err.message, 'error'); }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

async function pageTasks(container) {
  container.innerHTML = '<div class="loader"><div class="spinner"></div>Cargando...</div>';
  let tasks = [], employees = [], fStatus = 'all', fPriority = 'all';

  async function load() {
    [tasks, employees] = await Promise.all([api('GET', '/tasks'), api('GET', '/employees')]);
    render();
  }

  function filtered() {
    return tasks.filter(t =>
      (fStatus   === 'all' || t.status   === fStatus) &&
      (fPriority === 'all' || t.priority === fPriority)
    );
  }

  function render() {
    const list = filtered();
    container.innerHTML = `
      <div class="panel">
        <div class="panel__header">
          <h2>Tareas <span class="muted" style="font-weight:400">(${list.length})</span></h2>
          <div class="panel__toolbar">
            <select class="filter-select" id="tf-status">
              <option value="all">Todos los estados</option>
              <option value="pending"     ${fStatus==='pending'    ?'selected':''}>Pendiente</option>
              <option value="in_progress" ${fStatus==='in_progress'?'selected':''}>En progreso</option>
              <option value="completed"   ${fStatus==='completed'  ?'selected':''}>Completada</option>
              <option value="cancelled"   ${fStatus==='cancelled'  ?'selected':''}>Cancelada</option>
            </select>
            <select class="filter-select" id="tf-priority">
              <option value="all">Todas las prioridades</option>
              <option value="urgent" ${fPriority==='urgent'?'selected':''}>Urgente</option>
              <option value="high"   ${fPriority==='high'  ?'selected':''}>Alta</option>
              <option value="medium" ${fPriority==='medium'?'selected':''}>Media</option>
              <option value="low"    ${fPriority==='low'   ?'selected':''}>Baja</option>
            </select>
            <button class="btn btn--primary" id="task-new">+ Nueva tarea</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Título</th><th>Asignado a</th><th>Prioridad</th><th>Estado</th><th>Fecha límite</th><th>Ubicación</th><th>Acciones</th></tr></thead>
            <tbody>
              ${list.length ? list.map(t => `
                <tr>
                  <td>
                    <strong>${esc(t.title)}</strong>
                    ${t.description?`<div class="muted" style="font-size:.8125rem;margin-top:.1rem">${esc(t.description.slice(0,55))}${t.description.length>55?'…':''}</div>`:''}
                  </td>
                  <td class="muted">${esc(t.assigned_to_name||'—')}</td>
                  <td><span class="badge badge--${t.priority}">${PRIORITY_LABEL[t.priority]||t.priority}</span></td>
                  <td><span class="badge badge--${t.status}">${STATUS_LABEL[t.status]||t.status}</span></td>
                  <td class="muted">${formatDate(t.due_date)}</td>
                  <td class="muted">${esc(t.location_name||'—')}</td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${t.id}">Editar</button>
                      <button class="btn btn--danger btn--sm" data-action="del" data-id="${t.id}">Eliminar</button>
                    </div>
                  </td>
                </tr>`).join('') : `<tr><td colspan="7" class="table-empty">No hay tareas</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('tf-status').addEventListener('change', e => { fStatus = e.target.value; render(); });
    document.getElementById('tf-priority').addEventListener('change', e => { fPriority = e.target.value; render(); });
    document.getElementById('task-new').addEventListener('click', () => modalTask(null, employees, load));

    container.querySelectorAll('[data-action]').forEach(btn => {
      const task = tasks.find(t => t.id === +btn.dataset.id);
      if (btn.dataset.action === 'edit') btn.addEventListener('click', () => modalTask(task, employees, load));
      if (btn.dataset.action === 'del')  btn.addEventListener('click', () => deleteTask(task, load));
    });
  }

  await load();
}

function modalTask(task, employees, onSave) {
  const isNew = !task;
  const o = document.createElement('div');
  o.className = 'modal-overlay';
  o.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>${isNew ? 'Nueva tarea' : 'Editar tarea'}</h3>
        <button class="modal__close">✕</button>
      </div>
      <div class="modal__body">
        <div id="merr"></div>
        <form id="task-form">
          <div class="form-group"><label>Título *</label><input name="title" required value="${esc(task?.title||'')}"/></div>
          <div class="form-group"><label>Descripción</label><textarea name="description">${esc(task?.description||'')}</textarea></div>
          <div class="form-row">
            <div class="form-group">
              <label>Asignado a</label>
              <select name="assigned_to">
                <option value="">Sin asignar</option>
                ${employees.filter(e=>e.active).map(e=>`<option value="${e.id}"${task?.assigned_to===e.id?' selected':''}>${esc(e.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Prioridad</label>
              <select name="priority">
                <option value="low"    ${task?.priority==='low'   ?'selected':''}>Baja</option>
                <option value="medium" ${!task||task?.priority==='medium'?'selected':''}>Media</option>
                <option value="high"   ${task?.priority==='high'  ?'selected':''}>Alta</option>
                <option value="urgent" ${task?.priority==='urgent'?'selected':''}>Urgente</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Estado</label>
              <select name="status">
                <option value="pending"     ${!task||task?.status==='pending'    ?'selected':''}>Pendiente</option>
                <option value="in_progress" ${task?.status==='in_progress'?'selected':''}>En progreso</option>
                <option value="completed"   ${task?.status==='completed'  ?'selected':''}>Completada</option>
                <option value="cancelled"   ${task?.status==='cancelled'  ?'selected':''}>Cancelada</option>
              </select>
            </div>
            <div class="form-group">
              <label>Fecha límite</label>
              <input name="due_date" type="datetime-local" value="${task?.due_date?task.due_date.slice(0,16):''}"/>
            </div>
          </div>
          <div class="form-group"><label>Nombre de ubicación</label><input name="location_name" value="${esc(task?.location_name||'')}"/></div>
          <div class="form-row">
            <div class="form-group"><label>Latitud</label><input name="location_lat" type="number" step="any" value="${task?.location_lat??''}"/></div>
            <div class="form-group"><label>Longitud</label><input name="location_lng" type="number" step="any" value="${task?.location_lng??''}"/></div>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" id="mcancel">Cancelar</button>
        <button class="btn btn--primary" id="msave">${isNew?'Crear tarea':'Guardar cambios'}</button>
      </div>
    </div>`;

  document.body.appendChild(o);
  const close = () => o.remove();
  o.querySelector('.modal__close').addEventListener('click', close);
  o.querySelector('#mcancel').addEventListener('click', close);
  o.addEventListener('click', e => { if (e.target === o) close(); });

  o.querySelector('#msave').addEventListener('click', async () => {
    const form = o.querySelector('#task-form');
    const errEl = o.querySelector('#merr');
    const btn = o.querySelector('#msave');
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form));
    if (data.assigned_to) data.assigned_to = parseInt(data.assigned_to, 10);
    if (data.location_lat !== '') data.location_lat = parseFloat(data.location_lat);
    if (data.location_lng !== '') data.location_lng = parseFloat(data.location_lng);
    // Strip empty strings
    Object.keys(data).forEach(k => { if (data[k] === '' || (typeof data[k] === 'number' && isNaN(data[k]))) delete data[k]; });

    btn.disabled = true; btn.textContent = 'Guardando…'; errEl.innerHTML = '';
    try {
      if (isNew) {
        await api('POST', '/tasks', data);
        toast('Tarea creada');
      } else {
        await api('PUT', `/tasks/${task.id}`, data);
        toast('Tarea actualizada');
      }
      close(); onSave();
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert--error">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = isNew ? 'Crear tarea' : 'Guardar cambios';
    }
  });
}

async function deleteTask(task, onDone) {
  if (!confirm(`¿Eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`)) return;
  try {
    await api('DELETE', `/tasks/${task.id}`);
    toast('Tarea eliminada');
    onDone();
  } catch (err) { toast(err.message, 'error'); }
}

// ─── Map ──────────────────────────────────────────────────────────────────────

async function pageMap(container) {
  container.innerHTML = `
    <div class="panel">
      <div class="panel__header">
        <h2>Ubicación en tiempo real</h2>
        <span class="muted" id="map-ts">Actualizando…</span>
      </div>
      <div id="map"></div>
    </div>`;

  await new Promise(r => setTimeout(r, 60));

  const L = window.L;
  if (!L) {
    container.innerHTML = '<div class="alert alert--error">Leaflet no disponible. Verifica tu conexión a internet.</div>';
    return;
  }

  S.map = L.map('map').setView([23.6345, -102.5528], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(S.map);

  async function refresh() {
    if (!S.map) return;
    try {
      const locs = await api('GET', '/location/employees');
      const ts = document.getElementById('map-ts');
      if (ts) ts.textContent = `Actualizado: ${new Date().toLocaleTimeString('es-MX')}`;

      const seen = new Set();
      locs.forEach(loc => {
        const key = String(loc.employee_id);
        seen.add(key);
        const popup = `
          <div style="min-width:160px;font-family:system-ui,sans-serif;font-size:13px">
            <strong>${esc(loc.name)}</strong><br/>
            <span style="color:#6b7280">${esc(loc.email)}</span>
            <hr style="margin:.4rem 0;border:none;border-top:1px solid #e5e7eb"/>
            📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}<br/>
            🕐 ${timeAgo(loc.updated_at)}
            ${loc.clock_in  ? `<br/>⏰ Entrada: ${formatTime(loc.clock_in)}` : ''}
            ${loc.clock_out ? `<br/>⏏ Salida: ${formatTime(loc.clock_out)}` : ''}
          </div>`;

        if (S.markers[key]) {
          S.markers[key].setLatLng([loc.lat, loc.lng]).setPopupContent(popup);
        } else {
          const icon = L.divIcon({
            className: '',
            html: `<div style="background:#2563eb;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${initials(loc.name)}</div>`,
            iconSize: [34,34], iconAnchor: [17,17],
          });
          S.markers[key] = L.marker([loc.lat, loc.lng], { icon }).bindPopup(popup).addTo(S.map);
        }
      });

      Object.keys(S.markers).forEach(k => {
        if (!seen.has(k)) { S.map.removeLayer(S.markers[k]); delete S.markers[k]; }
      });

      if (Object.keys(S.markers).length > 0) {
        S.map.fitBounds(L.featureGroup(Object.values(S.markers)).getBounds().pad(.3));
      }
    } catch (err) {
      console.warn('Map refresh error:', err.message);
    }
  }

  await refresh();
  S.mapInterval = setInterval(refresh, 30000);
}

// ─── Attendance ───────────────────────────────────────────────────────────────

async function pageAttendance(container) {
  container.innerHTML = '<div class="loader"><div class="spinner"></div>Cargando...</div>';

  // Default to today
  const todayStr = new Date().toISOString().slice(0,10);
  let selectedDate = todayStr;

  async function load(date) {
    const [records, employees] = await Promise.all([
      api('GET', `/attendance?date=${date}`),
      api('GET', '/employees'),
    ]);
    render(date, records, employees);
  }

  function render(date, records, employees) {
    // Build lookup by employee_id
    const byEmp = {};
    records.forEach(r => { byEmp[r.employee_id] = r; });

    const active = employees.filter(e => e.active);

    container.innerHTML = `
      <div class="panel">
        <div class="panel__header">
          <h2>Asistencia</h2>
          <div class="panel__toolbar">
            <input type="date" class="filter-select" id="att-date" value="${date}" max="${todayStr}"/>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Empleado</th><th>Departamento</th><th>Entrada</th><th>Salida</th><th>Horas trabajadas</th><th>Entrada (coordenadas)</th></tr></thead>
            <tbody>
              ${active.length ? active.map(emp => {
                const r = byEmp[emp.id];
                const ci = r?.clock_in  ? formatTime(r.clock_in)  : null;
                const co = r?.clock_out ? formatTime(r.clock_out) : null;
                return `
                  <tr>
                    <td>
                      <div class="flex gap-2" style="align-items:center">
                        <div class="avatar avatar--sm">${initials(emp.name)}</div>
                        <div>
                          <strong>${esc(emp.name)}</strong>
                          <div class="muted" style="font-size:.75rem">${esc(emp.position||'')}</div>
                        </div>
                      </div>
                    </td>
                    <td class="muted">${esc(emp.department||'—')}</td>
                    <td>${ci ? `<span style="color:#16a34a;font-weight:500">${ci}</span>` : '<span class="muted">—</span>'}</td>
                    <td>${co ? `<span style="color:#dc2626;font-weight:500">${co}</span>` : '<span class="muted">—</span>'}</td>
                    <td>${calcHours(r?.clock_in, r?.clock_out)}</td>
                    <td class="muted" style="font-size:.8125rem">${r?.clock_in_lat!=null ? `${r.clock_in_lat.toFixed(4)}, ${r.clock_in_lng.toFixed(4)}` : '—'}</td>
                  </tr>`;
              }).join('') : `<tr><td colspan="6" class="table-empty">No hay empleados activos</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('att-date').addEventListener('change', async e => {
      selectedDate = e.target.value;
      const [rec, emp] = await Promise.all([
        api('GET', `/attendance?date=${selectedDate}`),
        api('GET', '/employees'),
      ]);
      render(selectedDate, rec, emp);
    });
  }

  try {
    await load(selectedDate);
  } catch (err) {
    container.innerHTML = `<div class="alert alert--error">${esc(err.message)}</div>`;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('hashchange', () => {
  if (S.token) navigate(location.hash.slice(1) || 'dashboard');
});

(function init() {
  if (!S.token) { renderLogin(); return; }
  // Non-admins belong in the employee app
  if (S.user?.role !== 'admin') {
    window.location.href = '/employee';
    return;
  }
  renderShell();
  navigate(location.hash.slice(1) || 'dashboard');
})();
