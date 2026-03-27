'use strict';

// ─── Elementos ────────────────────────────────────────────────────────────────
const screenLogin    = document.getElementById('screen-login');
const screenChangePw = document.getElementById('screen-change-pw');
const loginForm      = document.getElementById('login-form');
const changeForm     = document.getElementById('change-form');
const loginError     = document.getElementById('login-error');
const changeError    = document.getElementById('change-error');
const changeSuccess  = document.getElementById('change-success');
const btnLogin       = document.getElementById('btn-login');
const btnChange      = document.getElementById('btn-change');

const newPwInput     = document.getElementById('new-pw');

// ─── Toggle visibilidad de contraseña ─────────────────────────────────────────
document.querySelectorAll('.toggle-pw').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAlert(loginError, null);
  setLoading(btnLogin, true, 'Verificando…');

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert(loginError, data.error || 'Error al iniciar sesión');
      return;
    }

    if (data.firstLogin) {
      // Mostrar pantalla de cambio obligatorio
      screenLogin.hidden = true;
      screenChangePw.hidden = false;
    } else {
      window.location.replace('/dashboard');
    }
  } catch {
    setAlert(loginError, 'Error de red. Verifica tu conexión e intenta nuevamente.');
  } finally {
    setLoading(btnLogin, false, 'Acceder');
  }
});

// ─── Cambio de contraseña ─────────────────────────────────────────────────────
changeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAlert(changeError, null);
  setAlert(changeSuccess, null);
  setLoading(btnChange, true, 'Guardando…');

  const currentPassword  = document.getElementById('current-pw').value;
  const newPassword      = document.getElementById('new-pw').value;
  const confirmPassword  = document.getElementById('confirm-pw').value;

  if (newPassword !== confirmPassword) {
    setAlert(changeError, 'La nueva contraseña y su confirmación no coinciden');
    setLoading(btnChange, false, 'Guardar contraseña');
    return;
  }

  try {
    const res  = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json();

    if (!res.ok) {
      let msg = data.error || 'Error al cambiar contraseña';
      if (data.details?.length) msg += ':\n• ' + data.details.join('\n• ');
      setAlert(changeError, msg);
      return;
    }

    setAlert(changeSuccess, '✅ Contraseña actualizada. Redirigiendo…');
    setTimeout(() => window.location.replace('/dashboard'), 1200);
  } catch {
    setAlert(changeError, 'Error de red. Intenta nuevamente.');
  } finally {
    setLoading(btnChange, false, 'Guardar contraseña');
  }
});

// ─── Indicador de fortaleza de contraseña ─────────────────────────────────────
newPwInput.addEventListener('input', () => {
  const pw = newPwInput.value;
  updateStrengthUI(pw);
  updateRules(pw);
});

function updateStrengthUI(pw) {
  const container = document.getElementById('pw-strength');
  container.innerHTML = '';

  const score = calcStrength(pw);
  const labels = ['', 'Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte'];
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

  const bar = document.createElement('div');
  bar.className = 'pw-strength-bar';
  bar.style.cssText = `height:4px;border-radius:2px;background:linear-gradient(to right,${colors[score]} ${score * 20}%,rgba(148,163,184,.15) ${score * 20}%);transition:background .3s;`;

  const label = document.createElement('div');
  label.className = 'pw-strength-text';
  label.textContent = pw.length ? labels[score] : '';
  label.style.color = colors[score];

  container.appendChild(bar);
  container.appendChild(label);
}

function calcStrength(pw) {
  let score = 0;
  if (!pw) return 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[@$!%*?&_#^+=\-]/.test(pw)) score++;
  return Math.min(score, 5);
}

function updateRules(pw) {
  setRule('rule-len',     pw.length >= 12);
  setRule('rule-upper',   /[A-Z]/.test(pw));
  setRule('rule-lower',   /[a-z]/.test(pw));
  setRule('rule-num',     /[0-9]/.test(pw));
  setRule('rule-special', /[@$!%*?&_#^+=\-]/.test(pw));
}

function setRule(id, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('ok', ok);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setAlert(el, msg) {
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = msg;
  el.hidden = false;
}

function setLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.textContent = text;
}
