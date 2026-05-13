import { http } from './http';

/** Public courses (`/api/courses`) — unauthenticated */
export const catalogApi = {
  listCourses: () => http.get('/courses/public', { authScope: null }),
  getCourse: (courseId) => http.get(`/courses/${encodeURIComponent(String(courseId))}`, { authScope: null }),
};
