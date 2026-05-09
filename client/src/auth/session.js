const AUTH_EVENT = 'mrb-auth-changed';
let adminSessionActive = false;
let studentSessionActive = false;

const SS_STUDENT_USER = 'student_user';
const SS_ADMIN_USER = 'admin_user';

function purgeLegacyTokenKeys() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('mrb_access_admin');
    sessionStorage.removeItem('mrb_access_student');
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('student_access_token');
    localStorage.removeItem('student_user');
    localStorage.removeItem('admin_user');
  } catch {
    // ignore
  }
}

function writeSessionValue(storageKey, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // ignore quota / privacy mode
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
  studentSessionActive = false;
  writeSessionValue(SS_STUDENT_USER, null);
  notifyAuthChanged();
}

export function clearAdminAuth() {
  adminSessionActive = false;
  writeSessionValue(SS_ADMIN_USER, null);
  notifyAuthChanged();
}

export function clearAllAuth() {
  adminSessionActive = false;
  studentSessionActive = false;
  writeSessionValue(SS_ADMIN_USER, null);
  writeSessionValue(SS_STUDENT_USER, null);
  notifyAuthChanged();
}

export function setStudentAuth(token, student) {
  studentSessionActive = true;
  writeSessionValue(SS_STUDENT_USER, JSON.stringify(student || {}));
  notifyAuthChanged();
}

export function setAdminAuth(token, admin) {
  adminSessionActive = true;
  if (admin) writeSessionValue(SS_ADMIN_USER, JSON.stringify(admin));
  else writeSessionValue(SS_ADMIN_USER, null);
  notifyAuthChanged();
}

export function getStudentToken() {
  purgeLegacyTokenKeys();
  if (!studentSessionActive && getStoredUser('student_user')?.id) {
    studentSessionActive = true;
  }
  return studentSessionActive ? '__cookie_session__' : null;
}

export function getAdminToken() {
  purgeLegacyTokenKeys();
  if (!adminSessionActive && getStoredUser('admin_user')?.id) {
    adminSessionActive = true;
  }
  return adminSessionActive ? '__cookie_session__' : null;
}

export function getStoredUser(key) {
  const mappedKey = key === 'student_user' ? SS_STUDENT_USER : key === 'admin_user' ? SS_ADMIN_USER : key;
  const raw = typeof window === 'undefined' ? null : sessionStorage.getItem(mappedKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      if (typeof window !== 'undefined') sessionStorage.removeItem(mappedKey);
      notifyAuthChanged();
      return null;
    }
    return parsed;
  } catch {
    if (typeof window !== 'undefined') sessionStorage.removeItem(mappedKey);
    notifyAuthChanged();
    return null;
  }
}
