import { subscribeCrossTabRefresh, broadcastLogout } from './crossTabRefreshCoordinator.js';
import { setAuthAuthenticated, setAuthGuest } from './authStateMachine.js';

const AUTH_EVENT = 'mrb-auth-changed';
let adminSessionActive = false;
let studentSessionActive = false;
let teacherSessionActive = false;

// Canonical storage keys for non-sensitive user display data only
// (id, fullName, email, role, username, verification flags). Access /
// refresh tokens are NEVER written here -- they live exclusively in
// HttpOnly cookies set by the server.
const LS_STUDENT_USER = 'student_user';
const LS_ADMIN_USER = 'admin_user';
const LS_TEACHER_USER = 'teacher_user';

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
    localStorage.removeItem('teacher_access_token');

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

    const legacyTeacher = sessionStorage.getItem(LS_TEACHER_USER);
    if (legacyTeacher && !localStorage.getItem(LS_TEACHER_USER)) {
      localStorage.setItem(LS_TEACHER_USER, legacyTeacher);
    }
    if (legacyTeacher) sessionStorage.removeItem(LS_TEACHER_USER);
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

/** Role-scoped localStorage keys — each role is isolated; cross-tab sync ignores other roles. */
const ROLE_USER_STORAGE_KEYS = Object.freeze([LS_STUDENT_USER, LS_ADMIN_USER, LS_TEACHER_USER]);

/**
 * Cross-tab sync: localStorage writes in one tab fire `storage` in siblings.
 * Only reconcile the role that changed — ignore unrelated keys entirely.
 */
function handleCrossTabStorageEvent(event) {
  if (!event.key || !ROLE_USER_STORAGE_KEYS.includes(event.key)) return;
  if (event.key === LS_STUDENT_USER) {
    studentSessionActive = Boolean(event.newValue);
    notifyAuthChanged();
    return;
  }
  if (event.key === LS_ADMIN_USER) {
    adminSessionActive = Boolean(event.newValue);
    notifyAuthChanged();
    return;
  }
  if (event.key === LS_TEACHER_USER) {
    teacherSessionActive = Boolean(event.newValue);
    notifyAuthChanged();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', handleCrossTabStorageEvent);
}

function applyCrossTabRefreshUser(scope, user) {
  if (!user || typeof user !== 'object' || user.id == null) return;
  const serialized = JSON.stringify(user);
  if (scope === 'student') {
    studentSessionActive = true;
    writeUserRecord(LS_STUDENT_USER, serialized);
  } else if (scope === 'admin') {
    adminSessionActive = true;
    writeUserRecord(LS_ADMIN_USER, serialized);
  } else if (scope === 'teacher') {
    teacherSessionActive = true;
    writeUserRecord(LS_TEACHER_USER, serialized);
  } else {
    return;
  }
  notifyAuthChanged();
}

function handleCrossTabRefreshEvent(payload) {
  if (!payload || payload.type !== 'refresh-complete' || !payload.ok) return;
  applyCrossTabRefreshUser(payload.scope, payload.user);
}

function handleCrossTabRefreshFailedEvent(payload) {
  if (!payload || payload.type !== 'refresh-failed' || !payload.revoked) return;
  if (payload.scope === 'student') clearStudentAuth();
  else if (payload.scope === 'admin') clearAdminAuth();
  else if (payload.scope === 'teacher') clearTeacherAuth();
  syncGlobalAuthState('refresh-revoked');
}

function handleCrossTabLogoutEvent(payload) {
  if (!payload || payload.type !== 'logout-complete' || !payload.scope) return;
  if (payload.scope === 'student') clearStudentAuth();
  else if (payload.scope === 'admin') clearAdminAuth();
  else if (payload.scope === 'teacher') clearTeacherAuth();
  syncGlobalAuthState('logout');
}

if (typeof window !== 'undefined') {
  subscribeCrossTabRefresh((payload) => {
    handleCrossTabRefreshEvent(payload);
    handleCrossTabRefreshFailedEvent(payload);
    handleCrossTabLogoutEvent(payload);
  });
}

function reconcileStudentSessionFromStorage() {
  purgeLegacyAuthStorage();
  const stored = getStoredUser('student_user');
  studentSessionActive = Boolean(stored?.id);
  return studentSessionActive;
}

function reconcileAdminSessionFromStorage() {
  purgeLegacyAuthStorage();
  const stored = getStoredUser('admin_user');
  adminSessionActive = Boolean(stored?.id);
  return adminSessionActive;
}

function reconcileTeacherSessionFromStorage() {
  purgeLegacyAuthStorage();
  const stored = getStoredUser('teacher_user');
  teacherSessionActive = Boolean(stored?.id);
  return teacherSessionActive;
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

export function syncGlobalAuthState(reason = null) {
  if (getAdminToken() || getStudentToken() || getTeacherToken()) {
    setAuthAuthenticated();
  } else {
    setAuthGuest(reason || 'no-active-session');
  }
}

/** Notify other tabs that this role signed out (same-origin BroadcastChannel). */
export function broadcastRoleLogout(scope) {
  if (scope === 'admin' || scope === 'student' || scope === 'teacher') {
    broadcastLogout(scope);
  }
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

export function clearTeacherAuth() {
  teacherSessionActive = false;
  writeUserRecord(LS_TEACHER_USER, null);
  notifyAuthChanged();
}

export function clearAllAuth() {
  adminSessionActive = false;
  studentSessionActive = false;
  teacherSessionActive = false;
  writeUserRecord(LS_ADMIN_USER, null);
  writeUserRecord(LS_STUDENT_USER, null);
  writeUserRecord(LS_TEACHER_USER, null);
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

export function setTeacherAuth(token, teacher) {
  teacherSessionActive = true;
  writeUserRecord(LS_TEACHER_USER, JSON.stringify(teacher || {}));
  notifyAuthChanged();
}

export function getStudentToken() {
  return reconcileStudentSessionFromStorage() ? '__cookie_session__' : null;
}

export function getAdminToken() {
  return reconcileAdminSessionFromStorage() ? '__cookie_session__' : null;
}

export function getTeacherToken() {
  return reconcileTeacherSessionFromStorage() ? '__cookie_session__' : null;
}

export function getStoredUser(key) {
  const mappedKey =
    key === 'student_user'
      ? LS_STUDENT_USER
      : key === 'admin_user'
        ? LS_ADMIN_USER
        : key === 'teacher_user'
          ? LS_TEACHER_USER
          : key;
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
