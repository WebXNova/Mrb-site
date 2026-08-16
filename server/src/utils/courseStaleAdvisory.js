/**
 * Read-only advisory flags for admin UI — does not gate admissions or access.
 */

import { ADMISSION_STATUS, normalizeAdmissionStatus, normalizeDateOnly } from '../models/course.model.js';

/** @returns {string} YYYY-MM-DD (UTC calendar date) */
export function todayDateOnlyUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {unknown} endDate
 * @param {string} [today]
 */
export function isCourseEndDatePassed(endDate, today = todayDateOnlyUtc()) {
  const end = normalizeDateOnly(endDate);
  if (!end) return false;
  return end < today;
}

/**
 * @param {{ admission_status?: unknown, end_date?: unknown }} course
 * @param {string} [today]
 */
export function computeAdmissionStale(course, today = todayDateOnlyUtc()) {
  const status = normalizeAdmissionStatus(course?.admission_status);
  if (status !== ADMISSION_STATUS.OPEN) return false;
  return isCourseEndDatePassed(course?.end_date, today);
}

/**
 * @param {{ access_status?: unknown, course_end_date?: unknown }} enrollment
 * @param {string} [today]
 */
export function computeAccessStale(enrollment, today = todayDateOnlyUtc()) {
  const access = String(enrollment?.access_status ?? '').trim().toLowerCase();
  if (access !== 'active') return false;
  return isCourseEndDatePassed(enrollment?.course_end_date, today);
}
