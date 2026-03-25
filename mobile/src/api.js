import axios from 'axios';
import { storage } from './storage';

// Default base URL — Android emulator maps 10.0.2.2 to host's localhost
export const DEFAULT_BASE_URL = 'http://10.0.2.2:3000/api';

// Create the axios instance. The baseURL can be overridden at runtime via
// setBaseUrl() which is called on app start and after the user changes it
// in the Profile tab.
const api = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT from SecureStore on every request
api.interceptors.request.use(
  async (config) => {
    const token = await storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: normalise errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Error de red';
    return Promise.reject(new Error(message));
  }
);

// Allow dynamic base URL change (called from storage on app start / profile save)
export async function initBaseUrl() {
  const saved = await storage.getBaseUrl();
  if (saved) {
    api.defaults.baseURL = saved;
  }
}

export function setBaseUrl(url) {
  api.defaults.baseURL = url;
}

export function getBaseUrl() {
  return api.defaults.baseURL;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  updateMe: (currentPassword, password) =>
    api.put('/auth/me', { currentPassword, password }),
};

// ─── Attendance ──────────────────────────────────────────────────────────────

export const attendanceApi = {
  getToday: () =>
    api.get('/attendance/today'),

  clockIn: (lat, lng) =>
    api.post('/attendance/clock-in', { lat, lng }),

  clockOut: (lat, lng) =>
    api.post('/attendance/clock-out', { lat, lng }),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const tasksApi = {
  getMyTasks: () =>
    api.get('/tasks?assigned_to=me'),

  getTask: (id) =>
    api.get(`/tasks/${id}`),

  postUpdate: (id, status, note) =>
    api.post(`/tasks/${id}/updates`, { status, note }),
};

// ─── Location ────────────────────────────────────────────────────────────────

export const locationApi = {
  report: (lat, lng, accuracy) =>
    api.post('/location', { lat, lng, accuracy }),
};

export default api;
