import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import {
  buildStudentLoginRedirect,
  hasLocalStudentSession,
  isStudentAuthFailure,
  isStudentEntitlementFailure,
  terminateStudentSession,
} from '../utils/studentPortalAuth';

export function useStudentMyCourse() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authState, setAuthState] = useState('loading');
  const [accessDisplay, setAccessDisplay] = useState(null);

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
      setAccessDisplay(null);

      try {
        await studentApi.me();
        const response = await studentApi.myCourse();
        if (cancelled) return;
        setData(response?.data ?? null);
        setAccessDisplay(null);
        setAuthState('ok');
      } catch (err) {
        if (cancelled) return;

        if (isStudentAuthFailure(err)) {
          terminateStudentSession();
          navigate(buildStudentLoginRedirect(location.pathname, location.search), { replace: true });
          setAuthState('auth_required');
          return;
        }

        if (isStudentEntitlementFailure(err)) {
          let display = null;
          try {
            const statusRes = await studentApi.studentEnrollmentStatus();
            display = statusRes?.data ?? null;
          } catch {
            display = null;
          }
          if (cancelled) return;
          const finished =
            String(display?.accessDisplayStatus || '').toLowerCase() === 'course_finished';
          setError(
            finished
              ? 'This course has ended. You can still review your enrollment on My Courses.'
              : err?.message ||
                  'No active course enrollment was found. Complete enrollment and payment to unlock My Course.'
          );
          setAuthState('no_entitlement');
          setAccessDisplay(display);
          setData(null);
          return;
        }

        setError(err?.message || 'Failed to load your course.');
        setAuthState('error');
        setData(null);
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

  return { data, loading, error, authState, accessDisplay };
}
