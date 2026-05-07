const AUTH_EVENT = 'mrb-auth-changed';
let adminAccessToken = null;
let studentAccessToken = null;

const SS_STUDENT_AT = 'mrb_access_student';
const SS_ADMIN_AT = 'mrb_access_admin';
const SS_STUDENT_USER = 'student_user';
const SS_ADMIN_USER = 'admin_user';
const ACCESS_SKEW_MS = 10_000;

function purgeLegacyTokenKeys() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('student_access_token');
    localStorage.removeItem('student_user');
    localStorage.removeItem('admin_user');
  } catch {
    // ignore
  }
}

/** Non-authoritative JWT exp check — avoids needless /auth/refresh on every reload (rotation races under rapid F5). */
function jwtExpMs(payloadSegment) {
  try {
    const b64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded));
    if (typeof json.exp !== 'number') return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}

function isAccessTokenProbablyValid(raw) {
  const parts = String(raw || '').split('.');
  if (parts.length !== 3) return false;
  const expMs = jwtExpMs(parts[1]);
  if (!expMs) return false;
  return expMs > Date.now() + ACCESS_SKEW_MS;
}

function readSessionAccess(storageKey) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw || !isAccessTokenProbablyValid(raw)) {
      sessionStorage.removeItem(storageKey);
      return null;
    }
    return raw;
  } catch {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return null;
  }
}

function writeSessionAccess(storageKey, token) {
  if (typeof window === 'undefined') return;
  try {
    if (token) sessionStorage.setItem(storageKey, token);
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
  studentAccessToken = null;
  writeSessionAccess(SS_STUDENT_AT, null);
  writeSessionAccess(SS_STUDENT_USER, null);
  notifyAuthChanged();
}

export function clearAdminAuth() {
  adminAccessToken = null;
  writeSessionAccess(SS_ADMIN_AT, null);
  writeSessionAccess(SS_ADMIN_USER, null);
  notifyAuthChanged();
}

export function setStudentAuth(token, student) {
  studentAccessToken = token || null;
  writeSessionAccess(SS_STUDENT_AT, token || null);
  writeSessionAccess(SS_STUDENT_USER, JSON.stringify(student || {}));
  notifyAuthChanged();
}

export function setAdminAuth(token, admin) {
  adminAccessToken = token || null;
  writeSessionAccess(SS_ADMIN_AT, token || null);
  if (admin) writeSessionAccess(SS_ADMIN_USER, JSON.stringify(admin));
  else writeSessionAccess(SS_ADMIN_USER, null);
  notifyAuthChanged();
}

export function getStudentToken() {
  purgeLegacyTokenKeys();
  if (!studentAccessToken && typeof window !== 'undefined') {
    const recovered = readSessionAccess(SS_STUDENT_AT);
    if (recovered) studentAccessToken = recovered;
  }
  return studentAccessToken;
}

export function getAdminToken() {
  purgeLegacyTokenKeys();
  if (!adminAccessToken && typeof window !== 'undefined') {
    const recovered = readSessionAccess(SS_ADMIN_AT);
    if (recovered) adminAccessToken = recovered;
  }
  return adminAccessToken;
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
