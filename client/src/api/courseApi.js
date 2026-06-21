import { http } from './http';
import {
  mapCatalogCourseToCardProps,
  mapCatalogCourseToDetailProps,
} from '../course/coursePresentation';

function normalizeCourseList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapCatalogCourseToCardProps).filter(Boolean);
}

/**
 * Public course catalog — responses include admission_status, enrollment_message, dates.
 */
export const courseApi = {
  /** GET /api/courses/public */
  listPublic: async () => {
    const response = await http.get('/courses/public', { authScope: null });
    const rows = Array.isArray(response?.data) ? response.data : [];
    return {
      ...response,
      data: normalizeCourseList(rows),
    };
  },

  /** GET /api/courses/:id */
  getById: async (courseId) => {
    const response = await http.get(`/courses/${encodeURIComponent(String(courseId))}`, {
      authScope: null,
    });
    return {
      ...response,
      data: mapCatalogCourseToDetailProps(response?.data),
    };
  },

  listBatches: (courseId) =>
    http.get(`/courses/${encodeURIComponent(String(courseId))}/batches`, { authScope: null }),

  listSubjects: (courseId) =>
    http.get(`/courses/${encodeURIComponent(String(courseId))}/subjects`, { authScope: null }),
};

/** @deprecated Use courseApi — kept for existing imports */
export const catalogApi = {
  listCourses: () => courseApi.listPublic(),
  getCourse: (courseId) => courseApi.getById(courseId),
  listCourseBatches: (courseId) => courseApi.listBatches(courseId),
  listCourseSubjects: (courseId) => courseApi.listSubjects(courseId),
};
