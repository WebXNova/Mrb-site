import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from '../services/courseCatalogQueries.service.js';
import { isAdminRole } from '../utils/isAdminRole.js';

/**
 * Middleware that restricts access to courses based on lifecycle status.
 *
 * - Regular users: 404 for non-published courses
 * - Admins: bypass restrictions (can access any status)
 *
 * Must be used AFTER authentication middleware so `req.user` is populated.
 * Can be used as a route-level middleware or within controllers.
 *
 * @param {object} req
 * @param {object} res
 * @param {Function} next
 */
export async function requirePublishedCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id || req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
    }

    const row = await getCourseRowById(courseId);
    if (!row) {
      throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
    }

    const status = String(row.status || '').toLowerCase();
    const isAdmin = req.user && isAdminRole(req.user.role);

    // Admins can access any status
    if (isAdmin) {
      req.course = row;
      return next();
    }

    // Regular users: only published
    if (status !== 'published') {
      throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
    }

    req.course = row;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware that blocks writes (PUT/POST/DELETE) to published courses
 * unless the request is a status change.
 *
 * @param {object} req
 * @param {object} res
 * @param {Function} next
 */
export async function requireEditableCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id || req.params.courseId);
    if (!Number.isFinite(courseId) || courseId <= 0) {
      throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
    }

    const row = await getCourseRowById(courseId);
    if (!row) {
      throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
    }

    const status = String(row.status || '').toLowerCase();

    // Archived courses: only allow status change to draft
    if (status === 'archived') {
      const bodyStatus = req.body?.status ? String(req.body.status).toLowerCase() : null;
      if (bodyStatus !== 'draft') {
        throw new ApiError(409, 'Archived courses are read-only. Only status change to draft is allowed.', {
          code: 'COURSE_ARCHIVED',
        });
      }
    }

    req.course = row;
    next();
  } catch (error) {
    next(error);
  }
}
