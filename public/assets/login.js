'use strict';

// ─── Elementos ────────────────────────────────────────────────────────────────
const screenLogin    = document.getElementById('screen-login');
const screenOTP      = document.getElementById('screen-otp');
const screenChangePw = document.getElementById('screen-change-pw');
const loginForm      = document.getElementById('login-form');
const otpForm        = document.getElementById('otp-form');
const changeForm     = document.getElementById('change-form');
const loginError     = document.getElementById('login-error');
const otpError       = document.getElementById('otp-error');
const changeError    = document.getElementById('change-error');
const changeSuccess  = document.getElementById('change-success');
const btnLogin       = document.getElementById('btn-login');
const btnOTP         = document.getElementById('btn-otp');
const btnOTPBack     = document.getElementById('btn-otp-back');
const btnChange      = document.getElementById('btn-change');
const newPwInput     = document.getElementById('new-pw');

// Estado temporal del flujo OTP
let pendingOtpToken = null;

// ─── Toggle visibilidad de contraseña ─────────────────────────────────────────
const SVG_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:block"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

document.querySelectorAll('.toggle-pw').forEach((btn) => {
  btn.innerHTML = SVG_EYE;
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.innerHTML = input.type === 'password' ? SVG_EYE : SVG_EYE_OFF;
  });
});

// ─── Login (paso 1: contraseña) ───────────────────────────────────────────────
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
      // Primer ingreso o contraseña vencida → pantalla de cambio obligatorio
      screenLogin.hidden = true;
      screenChangePw.hidden = false;
      if (data.passwordExpired) {
        document.querySelector('#screen-change-pw .alert-warning strong').textContent = 'Contraseña vencida:';
        document.querySelector('#screen-change-pw .alert-warning').querySelector('strong').nextSibling.textContent =
          ' Tu contraseña ha expirado (política 120 días). Debes establecer una nueva para continuar.';
      }
    } else if (data.step === 'otp') {
      // Segundo paso: código OTP
      pendingOtpToken = data.otpToken;
      document.getElementById('otp-code').value = '';
      setAlert(otpError, null);
      if (data.message) {
        document.getElementById('otp-code').placeholder = '000000';
        // Mostrar mensaje de destino debajo del título
        const descEl = document.getElementById('otp-desc');
        if (descEl) descEl.textContent = data.message;
      }
      screenLogin.hidden = true;
      screenOTP.hidden = false;
      document.getElementById('otp-code').focus();
    } else {
      window.location.replace('/dashboard');
    }
  } catch {
    setAlert(loginError, 'Error de red. Verifica tu conexión e intenta nuevamente.');
  } finally {
    setLoading(btnLogin, false, 'Acceder');
  }
});

// ─── Verificar OTP (paso 2) ───────────────────────────────────────────────────
otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setAlert(otpError, null);
  setLoading(btnOTP, true, 'Verificando…');

  const code = document.getElementById('otp-code').value.trim();

  try {
    const res  = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otpToken: pendingOtpToken, code }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert(otpError, data.error || 'Código incorrecto');
      // Si la sesión expiró o demasiados intentos → volver al login
      if (res.status === 401 && data.error?.includes('Vuelve')) {
        setTimeout(() => resetToLogin(), 2000);
      }
      return;
    }

    window.location.replace('/dashboard');
  } catch {
    setAlert(otpError, 'Error de red. Intenta nuevamente.');
  } finally {
    setLoading(btnOTP, false, 'Verificar código');
  }
});

btnOTPBack.addEventListener('click', () => resetToLogin());

function resetToLogin() {
  pendingOtpToken = null;
  screenOTP.hidden = true;
  screenChangePw.hidden = true;
  screenLogin.hidden = false;
  setAlert(loginError, null);
  setAlert(otpError, null);
}

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
