// Pradsa Virtual – API client
const API = (() => {
  const BASE = '/api';

  function getToken() { return localStorage.getItem('pv_token'); }
  function setToken(t) { localStorage.setItem('pv_token', t); }
  function clearToken() { localStorage.removeItem('pv_token'); localStorage.removeItem('pv_user'); }

  function getUser() {
    try { return JSON.parse(localStorage.getItem('pv_user')); } catch { return null; }
  }
  function setUser(u) { localStorage.setItem('pv_user', JSON.stringify(u)); }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, message: data.error || 'Error desconocido', data };
    return data;
  }

  async function upload(path, formData) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(BASE + path, { method: 'POST', headers, body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, message: data.error || 'Error al subir archivo' };
    return data;
  }

  function requireAuth() {
    const token = getToken();
    if (!token) { window.location.href = '/login'; return false; }
    const user = getUser();
    if (user?.mustChangePassword) { window.location.href = '/login?change=1'; return false; }
    return true;
  }

  function requireAdmin() {
    if (!requireAuth()) return false;
    const user = getUser();
    if (user?.role !== 'admin') { window.location.href = '/dashboard'; return false; }
    return true;
  }

  return {
    get:     (p)    => request('GET',    p),
    post:    (p, b) => request('POST',   p, b),
    put:     (p, b) => request('PUT',    p, b),
    del:     (p)    => request('DELETE', p),
    upload,
    getToken, setToken, clearToken,
    getUser, setUser,
    requireAuth, requireAdmin,

    auth: {
      login: (username, password) => request('POST', '/auth/login', { username, password }),
      changePassword: (currentPassword, newPassword, confirmPassword) =>
        request('POST', '/auth/change-password', { currentPassword, newPassword, confirmPassword }),
      me: () => request('GET', '/auth/me'),
      logout: () => request('POST', '/auth/logout'),
    },

    admin: {
      getUsers: () => request('GET', '/admin/users'),
      createUser: (data) => request('POST', '/admin/users', data),
      updateUser: (id, data) => request('PUT', `/admin/users/${id}`, data),
      resetPassword: (id) => request('POST', `/admin/users/${id}/reset-password`),
      unlockUser: (id) => request('POST', `/admin/users/${id}/unlock`),
      getStats: () => request('GET', '/admin/stats'),
      getInterviews: () => request('GET', '/admin/interviews'),
      getAuditLogs: (params = '') => request('GET', `/admin/audit-logs${params}`),
    },

    interviews: {
      list: () => request('GET', '/interviews'),
      create: (data) => request('POST', '/interviews', data),
      get: (id) => request('GET', `/interviews/${id}`),
      update: (id, data) => request('PUT', `/interviews/${id}`, data),
      cancel: (id) => request('DELETE', `/interviews/${id}`),
    },

    session: {
      guestInfo: (token) => request('GET', `/session/guest/${token}`),
      guestLocation: (token, lat, lon) => request('POST', `/session/guest/${token}/location`, { lat, lon }),
      guestJoin: (token) => request('POST', `/session/guest/${token}/join`),
      guestEnd: (token) => request('POST', `/session/guest/${token}/end`),
      start: (id) => request('POST', `/session/${id}/start`),
      end: (id) => request('POST', `/session/${id}/end`),
      saveQuestionnaire: (id, answers) => request('POST', `/session/${id}/questionnaire`, { answers }),
      uploadPhoto: (id, blob, filename = 'photo.jpg') => {
        const fd = new FormData();
        fd.append('photo', blob, filename);
        return upload(`/session/${id}/photos`, fd);
      },
    },
  };
})();
