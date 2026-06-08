import crypto from 'crypto';
import { AttemptTokenInvalidError } from '../errors/testAttempt/TestAttemptErrors.js';

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function parsePositiveInt(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function readAttemptBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

/**
 * Constant-time compare for attempt session tokens (prevents timing leaks).
 * @param {string|null|undefined} stored
 * @param {string|null|undefined} provided
 */
export function assertAttemptTokenMatches(stored, provided) {
  if (!provided || typeof provided !== 'string' || provided.trim() === '') {
    throw new AttemptTokenInvalidError({ reason: 'missing_attempt_token' });
  }
  if (!stored || typeof stored !== 'string' || stored.trim() === '') {
    throw new AttemptTokenInvalidError({ reason: 'attempt_token_not_bound' });
  }

  const a = Buffer.from(stored.trim());
  const b = Buffer.from(provided.trim());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AttemptTokenInvalidError({ reason: 'attempt_token_mismatch' });
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {number} studentId
 */
export function studentOwnsAttemptRow(row, studentId) {
  if (!row) return false;
  const sid = Number(studentId);
  const ownerStudentId = row.student_id == null ? null : Number(row.student_id);
  const ownerUserId = row.user_id == null ? null : Number(row.user_id);
  return (ownerStudentId != null && ownerStudentId === sid) || (ownerUserId != null && ownerUserId === sid);
}
