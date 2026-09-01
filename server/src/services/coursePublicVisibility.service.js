/**
 * Public catalog vs public detail visibility.
 *
 * Listing: published AND is_active AND admission OPEN (each hide independently).
 * Detail: catalog-visible, OR published + requester has an active enrollment.
 * Instructional CEE is unchanged — this only gates the public sales/catalog API.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { ADMISSION_STATUS, normalizeAdmissionStatus, normalizeCourseStatus } from '../models/course.model.js';
import { evaluateAccessRequest, readAccessToken } from './authDecisionEngine.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';

export function isPublicCatalogListVisible(row) {
  if (!row) return false;
  const active = row.is_active === undefined || row.is_active === null ? true : Boolean(Number(row.is_active));
  const published = normalizeCourseStatus(row.status) === 'published';
  const admissionOpen = normalizeAdmissionStatus(row.admission_status) === ADMISSION_STATUS.OPEN;
  return active && published && admissionOpen;
}

export async function viewerHasActiveEnrollment(userId, courseId) {
  const uid = Number(userId);
  const cid = Number(courseId);
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(cid) || cid <= 0) {
    return false;
  }
  const [rows] = await mysqlPool.query(
    `SELECT id FROM enrollments
     WHERE user_id = ? AND course_id = ? AND access_status = 'active'
     LIMIT 1`,
    [uid, cid]
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Optional student identity for public course detail. Invalid/missing cookies
 * are treated as anonymous (never 401 the public page).
 */
export async function tryResolvePublicViewerUserId(req) {
  try {
    const token = readAccessToken(req, 'student');
    if (!token) return null;
    const payload = await evaluateAccessRequest(req, { expectedRole: 'student' });
    const id = Number(payload?.id ?? payload?.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function canViewPublicCourseDetail(row, viewerUserId) {
  if (!row) return false;
  if (normalizeCourseStatus(row.status) !== 'published') return false;
  if (isPublicCatalogListVisible(row)) return true;
  if (!viewerUserId) return false;
  return viewerHasActiveEnrollment(viewerUserId, row.id);
}

export async function assertPublicCourseReadable(courseId, req) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const row = await getCourseRowById(cid);
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  const viewerUserId = await tryResolvePublicViewerUserId(req);
  const allowed = await canViewPublicCourseDetail(row, viewerUserId);
  if (!allowed) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  return row;
}
