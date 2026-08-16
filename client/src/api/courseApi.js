import { http } from './http';
import {
  fetchPublicCatalogCourses,
  fetchPublicCourseCategories,
} from '../course/publicCatalogQueries';
import {
  mapCatalogCourseToCardProps,
  mapCatalogCourseToDetailProps,
} from '../course/coursePresentation';

/**
 * Public course catalog — responses include admission_status, enrollment_message, dates.
 */
export const courseApi = {
  /** GET /api/courses/public */
  listPublic: async (filters = {}) => {
    const data = await fetchPublicCatalogCourses(filters);
    return { data };
  },

  /** GET /api/courses/categories */
  listCategories: async () => {
    const categories = await fetchPublicCourseCategories();
    return { data: { categories } };
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
  listCourses: (filters) => courseApi.listPublic(filters),
  getCourse: (courseId) => courseApi.getById(courseId),
  listCourseBatches: (courseId) => courseApi.listBatches(courseId),
  listCourseSubjects: (courseId) => courseApi.listSubjects(courseId),
  listCategories: () => courseApi.listCategories(),
};
