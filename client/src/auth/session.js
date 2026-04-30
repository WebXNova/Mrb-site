const AUTH_EVENT = 'mrb-auth-changed';

function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

export function onAuthChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function clearStudentAuth() {
  localStorage.removeItem('student_access_token');
  localStorage.removeItem('student_user');
  notifyAuthChanged();
}

export function clearAdminAuth() {
  localStorage.removeItem('admin_access_token');
  localStorage.removeItem('admin_user');
  notifyAuthChanged();
}

export function setStudentAuth(token, student) {
  localStorage.setItem('student_access_token', token);
  localStorage.setItem('student_user', JSON.stringify(student || {}));
  notifyAuthChanged();
}

export function setAdminAuth(token, admin) {
  localStorage.setItem('admin_access_token', token);
  if (admin) localStorage.setItem('admin_user', JSON.stringify(admin));
  notifyAuthChanged();
}

export function getStudentToken() {
  return localStorage.getItem('student_access_token');
}

export function getAdminToken() {
  return localStorage.getItem('admin_access_token');
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
