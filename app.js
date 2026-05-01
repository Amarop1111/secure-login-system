'use strict';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function showAlert(id, msg, type) {
  const el = $(id);
  el.textContent = msg;
  el.className = 'alert ' + type + ' show';
  el.hidden = false;
}
function hideAlert(id) {
  const el = $(id);
  el.hidden = true;
  el.className = 'alert';
}
function showErr(id, show) {
  $(id).className = 'err-msg' + (show ? ' show' : '');
}
function markField(inputId, errId, bad) {
  $(inputId).className = bad ? 'error' : '';
  showErr(errId, bad);
  return !bad;
}
function setLoading(btnId, loading, defaultText) {
  const btn = $(btnId);
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span>Please wait…' : defaultText;
}

async function api(path, body) {
  const res = await fetch('/api/auth' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
    hideAlert('alert-login');
    hideAlert('alert-reg');
  });
});

// ─── Password strength ────────────────────────────────────────────────────────
$('reg-password').addEventListener('input', function () {
  const val = this.value;
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const fill = $('strength-fill');
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#E24B4A', '#BA7517', '#1D9E75', '#0F6E56'];
  fill.style.width = (score * 25) + '%';
  fill.style.background = colors[score] || 'transparent';
  $('strength-label').textContent = labels[score] || '';
});

// ─── Register ────────────────────────────────────────────────────────────────
$('btn-register').addEventListener('click', async () => {
  hideAlert('alert-reg');
  const name = $('reg-name').value.trim();
  const email = $('reg-email').value.trim();
  const pass = $('reg-password').value;
  const conf = $('reg-confirm').value;
  const use2fa = $('enable-2fa').checked;

  let valid = true;
  valid = markField('reg-name', 'rn-err', !name) && valid;
  valid = markField('reg-email', 're-err', !validateEmail(email)) && valid;
  valid = markField('reg-password', 'rp-err', pass.length < 8 || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) && valid;
  valid = markField('reg-confirm', 'rc-err', pass !== conf) && valid;
  if (!valid) return;

  setLoading('btn-register', true);
  try {
    const data = await api('/register', { name, email, password: pass, enable2fa: use2fa });
    showAlert('alert-reg', data.message + (data.twoFactorQR ? ' Scan the QR in your authenticator app: ' + data.twoFactorQR : ''), 'success');
    $('reg-name').value = '';
    $('reg-email').value = '';
    $('reg-password').value = '';
    $('reg-confirm').value = '';
    $('enable-2fa').checked = false;
    $('strength-fill').style.width = '0';
    $('strength-label').textContent = '';
  } catch (err) {
    showAlert('alert-reg', err.message, 'danger');
  } finally {
    setLoading('btn-register', false, 'Create account');
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
$('btn-login').addEventListener('click', async () => {
  hideAlert('alert-login');
  const email = $('login-email').value.trim();
  const pass = $('login-password').value;

  let valid = true;
  valid = markField('login-email', 'le-err', !validateEmail(email)) && valid;
  valid = markField('login-password', 'lp-err', !pass) && valid;
  if (!valid) return;

  setLoading('btn-login', true);
  try {
    const data = await api('/login', { email, password: pass });
    if (data.requires2FA) {
      show2FAScreen();
    } else {
      showDashboard(data.user);
    }
  } catch (err) {
    showAlert('alert-login', err.message, 'danger');
  } finally {
    setLoading('btn-login', false, 'Sign in');
  }
});

// ─── 2FA ─────────────────────────────────────────────────────────────────────
function show2FAScreen() {
  switchScreen('screen-2fa');
  hideAlert('alert-2fa');
  const container = $('tfa-inputs');
  container.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const inp = document.createElement('input');
    inp.type = 'tel';
    inp.maxLength = 1;
    inp.inputMode = 'numeric';
    inp.dataset.idx = i;
    inp.addEventListener('input', function () {
      if (this.value && i < 5) container.children[i + 1].focus();
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && i > 0) container.children[i - 1].focus();
    });
    container.appendChild(inp);
  }
  container.children[0].focus();
}

$('btn-2fa').addEventListener('click', async () => {
  const inputs = $('tfa-inputs').children;
  const token = Array.from(inputs).map(i => i.value).join('');
  if (token.length < 6) {
    showAlert('alert-2fa', 'Please enter all 6 digits.', 'danger');
    return;
  }
  setLoading('btn-2fa', true);
  try {
    const data = await api('/verify-2fa', { token });
    showDashboard(data.user);
  } catch (err) {
    showAlert('alert-2fa', err.message, 'danger');
  } finally {
    setLoading('btn-2fa', false, 'Verify code');
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
function showDashboard(user) {
  switchScreen('screen-dashboard');
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  $('dash-name').textContent = user.name;
  $('dash-avatar').textContent = initials;
  $('dash-2fa').textContent = user.two_factor_enabled ? 'Enabled ✓' : 'Disabled';
  $('dash-2fa').className = 'value ' + (user.two_factor_enabled ? 'green' : '');
  $('dash-method').textContent = user.two_factor_enabled ? 'bcrypt + 2FA' : 'bcrypt';
  $('dash-time').textContent = new Date().toLocaleTimeString();
}

$('btn-logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (_) {}
  switchScreen('screen-auth');
  $('login-email').value = '';
  $('login-password').value = '';
});

// ─── Screen switcher ─────────────────────────────────────────────────────────
function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ─── Resume session on load ───────────────────────────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      showDashboard(data.user);
    }
  } catch (_) {}
})();
