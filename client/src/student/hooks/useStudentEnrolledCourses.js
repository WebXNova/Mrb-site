import { useEffect, useState } from 'react';
import { studentApi } from '../../api/studentApi';
import { collectStudentCourseTabs } from '../utils/collectStudentCourseTabs';
import { normaliseStudentDashboard } from '../utils/normaliseStudentDashboard';

async function loadEnrolledCourseTabs() {
  let dashboardPayload = null;
  let dashboardError = null;

  try {
    const dashboardResponse = await studentApi.dashboard();
    dashboardPayload = normaliseStudentDashboard(dashboardResponse?.data || {});
  } catch (err) {
    dashboardError = err;
  }

  let tabs = collectStudentCourseTabs({
    courses: dashboardPayload?.courses,
    course: dashboardPayload?.course,
    entitlement: dashboardPayload?.entitlement,
    lectures: dashboardPayload?.lectures,
  });

  if (tabs.length === 0) {
    try {
      const statusResponse = await studentApi.studentEnrollmentStatus();
      tabs = collectStudentCourseTabs({
        courses: dashboardPayload?.courses,
        course: dashboardPayload?.course,
        entitlement: dashboardPayload?.entitlement,
        lectures: dashboardPayload?.lectures,
        enrollmentStatus: statusResponse?.data ?? null,
      });
    } catch {
      /* enrollment-status is a fallback; dashboard error is reported below */
    }
  }

  const error =
    tabs.length === 0 && dashboardError
      ? dashboardError.message || 'Failed to load your enrolled course.'
      : '';

  return { tabs, error };
}

export function useStudentEnrolledCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await loadEnrolledCourseTabs();
        if (cancelled) return;
        setCourses(result.tabs);
        setError(result.error);
      } catch (err) {
        if (cancelled) return;
        setCourses([]);
        setError(err?.message || 'Failed to load your enrolled course.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { courses, loading, error };
}
