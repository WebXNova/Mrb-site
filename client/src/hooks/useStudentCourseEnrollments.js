import { useEffect, useMemo, useState } from 'react';
import { enrollmentApi } from '../api/enrollmentApi';
import { getStudentToken } from '../auth/session';

function indexEnrollmentsByCourseId(rows) {
  const map = {};
  for (const row of rows) {
    const courseId = row?.courseId ?? row?.course_id;
    if (courseId == null) continue;
    map[String(courseId)] = row;
  }
  return map;
}

export function useStudentCourseEnrollments() {
  const [byCourseId, setByCourseId] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!getStudentToken()) {
      setByCourseId({});
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const response = await enrollmentApi.listMine();
        const rows = Array.isArray(response?.data?.enrollments) ? response.data.enrollments : [];
        if (!cancelled) {
          setByCourseId(indexEnrollmentsByCourseId(rows));
        }
      } catch {
        if (!cancelled) {
          setByCourseId({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const getEnrollmentForCourse = useMemo(
    () => (courseId) => byCourseId[String(courseId)] ?? null,
    [byCourseId]
  );

  return { byCourseId, getEnrollmentForCourse, loading };
}
