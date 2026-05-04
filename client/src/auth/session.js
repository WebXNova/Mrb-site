const AUTH_EVENT = 'mrb-auth-changed';
let adminAccessToken = null;
let studentAccessToken = null;

function purgeLegacyTokenKeys() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('student_access_token');
  } catch {
    // ignore
  }
}

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

export function onAuthChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AUTH_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
  };
}

export function clearStudentAuth() {
  studentAccessToken = null;
  localStorage.removeItem('student_user');
  notifyAuthChanged();
}

export function clearAdminAuth() {
  adminAccessToken = null;
  localStorage.removeItem('admin_user');
  notifyAuthChanged();
}

export function setStudentAuth(token, student) {
  studentAccessToken = token || null;
  localStorage.setItem('student_user', JSON.stringify(student || {}));
  notifyAuthChanged();
}

export function setAdminAuth(token, admin) {
  adminAccessToken = token || null;
  if (admin) localStorage.setItem('admin_user', JSON.stringify(admin));
  else localStorage.removeItem('admin_user');
  notifyAuthChanged();
}

export function getStudentToken() {
  purgeLegacyTokenKeys();
  return studentAccessToken;
}

export function getAdminToken() {
  purgeLegacyTokenKeys();
  return adminAccessToken;
}

export function getStoredUser(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      localStorage.removeItem(key);
      notifyAuthChanged();
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(key);
    notifyAuthChanged();
    return null;
  }
}
