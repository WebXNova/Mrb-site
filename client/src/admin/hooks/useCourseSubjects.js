import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';

/**
 * Load subjects for a course from GET /api/admin/courses/:courseId/subjects
 * @param {string} token
 * @param {string|number|null|undefined} courseId
 */
export function useCourseSubjects(token, courseId) {
  const [subjects, setSubjects] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const cid = Number(courseId);
    if (!Number.isInteger(cid) || cid <= 0) {
      setSubjects([]);
      setIsLoading(false);
      setError('');
      return [];
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await adminApi.subjects(token, cid);
      const list = Array.isArray(response?.data) ? response.data : [];
      setSubjects(list);
      return list;
    } catch (err) {
      setSubjects([]);
      setError(err.message || 'Failed to load subjects for this course.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [token, courseId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const subjectIds = subjects
    .map((s) => Number(s.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return { subjects, subjectIds, isLoading, error, reload };
}
