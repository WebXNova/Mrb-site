import { isRefreshAuthRevokedError } from '../../api/requestClient';
import { clearStudentAuth, getStudentToken, getStoredUser } from '../../auth/session';

const AUTH_FAILURE_CODES = new Set([
  'AUTH_REQUIRED',
  'BEARER_REJECTED_IN_PRODUCTION',
  'UNAUTHORIZED',
  'INVALID_TOKEN',
  'SESSION_EXPIRED',
]);

const ENTITLEMENT_FAILURE_CODES = new Set([
  'ENROLLMENT_NOT_FOUND',
  'ACCESS_DENIED',
  'ACCESS_INACTIVE',
  'ACCESS_REVOKED',
  'ACCESS_EXPIRED',
  'COURSE_ACCESS_MISMATCH',
  'COURSE_NOT_ACCESSIBLE',
  'INVALID_ENTITLEMENT_STATE',
  'MULTIPLE_ACTIVE_ENROLLMENTS',
]);

export function hasLocalStudentSession() {
  const student = getStoredUser('student_user');
  return Boolean(getStudentToken() && student?.id && student.isVerified === true);
}

export function terminateStudentSession() {
  clearStudentAuth();
}

function readErrorCode(err) {
  return String(
    err?.errorCode ?? err?.code ?? err?.responseData?.error?.code ?? err?.details?.code ?? ''
  ).trim();
}

export function isStudentAuthFailure(err) {
  if (!err) return false;
  if (isRefreshAuthRevokedError(err)) return true;
  const status = Number(err?.status);
  if (status === 401) return true;
  const code = readErrorCode(err);
  if (AUTH_FAILURE_CODES.has(code)) return true;
  return /authentication required|session expired|login required|sign in again|invalid or expired token/i.test(
    String(err?.message || '')
  );
}

export function isStudentEntitlementFailure(err) {
  const status = Number(err?.status);
  const code = readErrorCode(err);
  if (ENTITLEMENT_FAILURE_CODES.has(code)) return true;
  if (status === 403 && /enrollment|entitlement|course access/i.test(String(err?.message || ''))) {
    return true;
  }
  return false;
}

export function buildStudentLoginRedirect(pathname, search = '') {
  const from = encodeURIComponent(`${pathname}${search || ''}`);
  return `/login?from=${from}`;
}
