import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import StudentActiveCourseCard from '../student/components/dashboard/StudentActiveCourseCard';
import StudentDashboardHero from '../student/components/dashboard/StudentDashboardHero';
import StudentDashboardSkeleton from '../student/components/dashboard/StudentDashboardSkeleton';
import StudentDashboardStats from '../student/components/dashboard/StudentDashboardStats';
import StudentLatestResultSection from '../student/components/dashboard/StudentLatestResultSection';
import StudentLearningActionGrid from '../student/components/dashboard/StudentLearningActionGrid';
import StudentRecommendedTestCard from '../student/components/dashboard/StudentRecommendedTestCard';
import { normaliseStudentDashboard } from '../student/utils/normaliseStudentDashboard';
import { isAdmissionOpen } from '../course/courseAdmissionPresentation';
import {
  buildStudentLoginRedirect,
  hasLocalStudentSession,
  isStudentAuthFailure,
  isStudentEntitlementFailure,
  terminateStudentSession,
} from '../student/utils/studentPortalAuth';
import '../student/styles/student-dashboard.css';

export default function StudentPortalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loadState, setLoadState] = useState('loading');

  const latestResult = useMemo(() => data?.results?.[0] || null, [data]);
  const latestTest = useMemo(() => data?.tests?.[0] || null, [data]);
  const notificationCount = useMemo(
    () => (data?.notifications || []).filter((item) => item && item.isRead === false).length,
    [data]
  );
  const activeCourse = useMemo(() => data?.courses?.[0] || data?.course || null, [data]);
  const showClosedAdmissionWarning = activeCourse && !isAdmissionOpen(activeCourse);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!hasLocalStudentSession()) {
        navigate(buildStudentLoginRedirect(location.pathname, location.search), { replace: true });
        return;
      }

      setLoadState('loading');
      setError('');
      setData(null);

      try {
        const response = await studentApi.dashboard();
        if (cancelled) return;
        if (!response?.data) {
          setError('Dashboard data is unavailable.');
          setLoadState('error');
          return;
        }
        setData(normaliseStudentDashboard(response.data));
        setLoadState('ok');
      } catch (err) {
        if (cancelled) return;

        if (isStudentAuthFailure(err)) {
          terminateStudentSession();
          navigate(buildStudentLoginRedirect(location.pathname, location.search), { replace: true });
          setLoadState('auth_required');
          return;
        }

        if (isStudentEntitlementFailure(err)) {
          setLoadState('no_entitlement');
          setData(null);
          return;
        }

        setError(err?.message || 'Failed to load your dashboard.');
        setData(null);
        setLoadState('error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  if (loadState === 'loading' || loadState === 'auth_required') {
    return <StudentDashboardSkeleton />;
  }

  if (loadState === 'no_entitlement') {
    return (
      <section className="sp-dashboard">
        <article className="sp-panel sp-panel--empty">
          <h2 className="sp-panel__title">Start your learning path</h2>
          <p className="sp-body">No active enrollment yet. Browse courses to unlock your dashboard.</p>
          <Link className="sp-btn sp-btn--primary" to="/courses">
            Browse courses
          </Link>
        </article>
      </section>
    );
  }

  if (loadState === 'error' || !data) {
    return (
      <section className="sp-dashboard">
        <article className="sp-panel sp-panel--warning">
          <h2 className="sp-panel__title">Dashboard unavailable</h2>
          <p className="sp-body sp-body--error">{error || 'Unable to load your dashboard.'}</p>
          <Link className="sp-btn sp-btn--secondary" to="/courses">
            Browse courses
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="sp-dashboard">
      {showClosedAdmissionWarning ? (
        <article className="sp-panel sp-panel--warning sp-admission-banner" role="status">
          <h2 className="sp-panel__title">Admissions closed</h2>
          <p className="sp-body">
            {activeCourse.enrollment_message ||
              'Admissions are currently closed for this course.'}{' '}
            Your access is unchanged — continue learning from your dashboard.
          </p>
        </article>
      ) : null}
      <StudentDashboardHero data={data} />
      <StudentDashboardStats data={data} />
      <StudentActiveCourseCard data={data} />
      <StudentLearningActionGrid data={data} notificationCount={notificationCount} />

      <div className="sp-dashboard__split">
        <StudentLatestResultSection result={latestResult} />
        <StudentRecommendedTestCard test={latestTest} />
      </div>
    </section>
  );
}
