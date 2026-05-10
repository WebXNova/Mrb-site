const AUTH_EVENT = 'mrb-auth-changed';
let adminSessionActive = false;
let studentSessionActive = false;

// Canonical storage keys for non-sensitive user display data only
// (id, fullName, email, role, username, verification flags). Access /
// refresh tokens are NEVER written here -- they live exclusively in
// HttpOnly cookies set by the server.
const LS_STUDENT_USER = 'student_user';
const LS_ADMIN_USER = 'admin_user';

/**
 * Defensive cleanup of legacy auth artifacts.
 *
 * 1. Removes any token-shaped keys that older builds may have left
 *    behind in either storage. Tokens must never live in web storage.
 * 2. One-time migrates the user-display record from sessionStorage
 *    (per-tab, was the cause of "logged out in every new tab") to
 *    localStorage (per-origin, shared across tabs) without logging
 *    out users who are currently signed in.
 */
function purgeLegacyAuthStorage() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('mrb_access_admin');
    sessionStorage.removeItem('mrb_access_student');
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('student_access_token');

    const legacyStudent = sessionStorage.getItem(LS_STUDENT_USER);
    if (legacyStudent && !localStorage.getItem(LS_STUDENT_USER)) {
      localStorage.setItem(LS_STUDENT_USER, legacyStudent);
    }
    if (legacyStudent) sessionStorage.removeItem(LS_STUDENT_USER);

    const legacyAdmin = sessionStorage.getItem(LS_ADMIN_USER);
    if (legacyAdmin && !localStorage.getItem(LS_ADMIN_USER)) {
      localStorage.setItem(LS_ADMIN_USER, legacyAdmin);
    }
    if (legacyAdmin) sessionStorage.removeItem(LS_ADMIN_USER);
  } catch {
    // ignore quota / privacy mode
  }
}

function writeUserRecord(storageKey, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) localStorage.setItem(storageKey, value);
    else localStorage.removeItem(storageKey);
  } catch {
    // ignore quota / privacy mode
  }
}

// Run migration eagerly at module load (and on every Vite HMR reload
// of this module). This guarantees that an already-signed-in tab
// promotes its sessionStorage record to localStorage immediately,
// so any new tab opened afterwards finds the shared record.
purgeLegacyAuthStorage();

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
  writeUserRecord(LS_STUDENT_USER, null);
  notifyAuthChanged();
}

export function clearAdminAuth() {
  adminSessionActive = false;
  writeUserRecord(LS_ADMIN_USER, null);
  notifyAuthChanged();
}

export function clearAllAuth() {
  adminSessionActive = false;
  studentSessionActive = false;
  writeUserRecord(LS_ADMIN_USER, null);
  writeUserRecord(LS_STUDENT_USER, null);
  notifyAuthChanged();
}

export function setStudentAuth(token, student) {
  studentSessionActive = true;
  writeUserRecord(LS_STUDENT_USER, JSON.stringify(student || {}));
  notifyAuthChanged();
}

export function setAdminAuth(token, admin) {
  adminSessionActive = true;
  if (admin) writeUserRecord(LS_ADMIN_USER, JSON.stringify(admin));
  else writeUserRecord(LS_ADMIN_USER, null);
  notifyAuthChanged();
}

export function getStudentToken() {
  purgeLegacyAuthStorage();
  if (!studentSessionActive && getStoredUser('student_user')?.id) {
    studentSessionActive = true;
  }
  return studentSessionActive ? '__cookie_session__' : null;
}

export function getAdminToken() {
  purgeLegacyAuthStorage();
  if (!adminSessionActive && getStoredUser('admin_user')?.id) {
    adminSessionActive = true;
  }
  return adminSessionActive ? '__cookie_session__' : null;
}

export function getStoredUser(key) {
  const mappedKey =
    key === 'student_user' ? LS_STUDENT_USER : key === 'admin_user' ? LS_ADMIN_USER : key;
  const raw = typeof window === 'undefined' ? null : localStorage.getItem(mappedKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      if (typeof window !== 'undefined') localStorage.removeItem(mappedKey);
      notifyAuthChanged();
      return null;
    }
    return parsed;
  } catch {
    if (typeof window !== 'undefined') localStorage.removeItem(mappedKey);
    notifyAuthChanged();
    return null;
  }
}
