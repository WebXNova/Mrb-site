import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enrollmentApi } from '../../api/enrollmentApi';
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
        const response = await enrollmentApi.listMine();
        if (cancelled) return;
        const rows = response?.data?.enrollments ?? [];
        setEnrollments(rows);
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
