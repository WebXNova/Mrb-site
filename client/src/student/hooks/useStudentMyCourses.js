import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enrollmentApi } from '../../api/enrollmentApi';
import { studentApi } from '../../api/studentApi';
import {
  buildStudentLoginRedirect,
  hasLocalStudentSession,
  isStudentAuthFailure,
  terminateStudentSession,
} from '../utils/studentPortalAuth';

export function useStudentMyCourses() {
  const navigate = useNavigate();
  const location = useLocation();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authState, setAuthState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasLocalStudentSession()) {
        navigate(buildStudentLoginRedirect(location.pathname, location.search), { replace: true });
        return;
      }

      setLoading(true);
      setError('');
      setAuthState('loading');

      try {
        const [listResponse, statusResponse] = await Promise.all([
          enrollmentApi.listMine(),
          studentApi.studentEnrollmentStatus().catch(() => null),
        ]);
        if (cancelled) return;
        const rows = listResponse?.data?.enrollments ?? [];
        const status = statusResponse?.data ?? null;
        const statusCourseId = Number(status?.courseId ?? status?.course_id);
        const merged = rows.map((row) => {
          if (!status || Number(row.courseId) !== statusCourseId) return row;
          return {
            ...row,
            accessDisplayStatus: status.accessDisplayStatus ?? row.accessDisplayStatus,
            accessDisplayLabel: status.accessDisplayLabel ?? row.accessDisplayLabel,
            finished_at: status.courseFinishedAt ?? status.finished_at ?? row.finished_at,
            is_finished:
              row.is_finished ||
              String(status.accessDisplayStatus || '').toLowerCase() === 'course_finished' ||
              Boolean(status.courseFinishedAt ?? status.finished_at),
          };
        });
        setEnrollments(merged);
        setAuthState('ok');
      } catch (err) {
        if (cancelled) return;

        if (isStudentAuthFailure(err)) {
          terminateStudentSession();
          navigate(buildStudentLoginRedirect(location.pathname, location.search), { replace: true });
          setAuthState('auth_required');
          return;
        }

        setError(err?.message || 'Failed to load your courses.');
        setAuthState('error');
        setEnrollments([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  return { enrollments, loading, error, authState };
}
