import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isRefreshAuthRevokedError, refreshAdminAccessToken, shouldAttemptAccessRefresh } from '../api/authRefresh';
import { clearAdminAuth, getAdminToken } from '../auth/session';
import ScrollToTop from '../components/layout/ScrollToTop';

const HomePage = lazy(() => import('../pages/HomePage'));
const CoursesPage = lazy(() => import('../pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('../pages/CourseDetailPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const StudentLoginPage = lazy(() => import('../pages/StudentLoginPage'));
const StudentRegisterPage = lazy(() => import('../pages/StudentRegisterPage'));
const StudentForgotPasswordPage = lazy(() => import('../pages/StudentForgotPasswordPage'));
const StudentResetPasswordPage = lazy(() => import('../pages/StudentResetPasswordPage'));
const StudentVerifyOtpPage = lazy(() => import('../pages/StudentVerifyOtpPage'));
const StudentVerifyMrbPage = lazy(() => import('../pages/StudentVerifyMrbPage'));
const StudentPortalPage = lazy(() => import('../pages/StudentPortalPage'));
const StudentTestsPage = lazy(() => import('../pages/StudentTestsPage'));
const StudentLecturesPage = lazy(() => import('../pages/StudentLecturesPage'));
const StudentResultsPage = lazy(() => import('../pages/StudentResultsPage'));
const StudentQuestionsPage = lazy(() => import('../pages/StudentQuestionsPage'));
const StudentAskQuestionPage = lazy(() => import('../pages/StudentAskQuestionPage'));
const StudentProfilePage = lazy(() => import('../pages/StudentProfilePage'));
const StudentNotificationsPage = lazy(() => import('../pages/StudentNotificationsPage'));
const StudentResultDetailPage = lazy(() => import('../pages/StudentResultDetailPage'));
const StudentLecturePlayerPage = lazy(() => import('../pages/StudentLecturePlayerPage'));
const StudentQuestionDetailPage = lazy(() => import('../pages/StudentQuestionDetailPage'));
const StudentTestHistoryPage = lazy(() => import('../pages/StudentTestHistoryPage'));
const StudentLayout = lazy(() => import('../student/components/StudentLayout'));
const PublicTestPage = lazy(() => import('../pages/PublicTestPage'));
const TestAttemptPage = lazy(() => import('../pages/TestAttemptPage'));
const TestResultPage = lazy(() => import('../pages/TestResultPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const TermsPage = lazy(() => import('../pages/TermsPage'));
const RefundPage = lazy(() => import('../pages/RefundPage'));
const AdminLayout = lazy(() => import('../admin/components/AdminLayout'));
const AdminLoginPage = lazy(() => import('../admin/pages/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('../admin/pages/AdminDashboardPage'));
const AdminCoursesPage = lazy(() => import('../admin/pages/AdminCoursesPage'));
const AdminLecturesPage = lazy(() => import('../admin/pages/AdminLecturesPage'));
const AdminUsersPage = lazy(() => import('../admin/pages/AdminUsersPage'));
const AdminMrbCodesPage = lazy(() => import('../admin/pages/AdminMrbCodesPage'));
const AdminLogsPage = lazy(() => import('../admin/pages/AdminLogsPage'));
const AdminTestsPage = lazy(() => import('../admin/pages/AdminTestsPage'));
const AdminSettingsPage = lazy(() => import('../admin/pages/AdminSettingsPage'));
const AdminQuestionsPage = lazy(() => import('../admin/pages/AdminQuestionsPage'));

function PageFallback() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--color-ink-400)',
      }}
    >
      Loading…
    </div>
  );
}

function initialRedirectIfAdminPhase() {
  const t = getAdminToken();
  if (!t) return 'guest';
  if (!shouldAttemptAccessRefresh(t)) return 'redirect';
  return 'checking';
}

function RequireAdmin({ children }) {
  const [gate, setGate] = useState('pending');
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    setGate('pending');
    (async () => {
      try {
        const token = getAdminToken();
        if (!token || shouldAttemptAccessRefresh(token)) {
          await refreshAdminAccessToken();
        }
        if (!cancelled) setGate('allow');
      } catch (e) {
        if (cancelled) return;
        if (isRefreshAuthRevokedError(e)) {
          clearAdminAuth();
          setGate('deny');
        } else {
          setGate('allow');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (gate === 'pending') return <PageFallback />;
  if (gate === 'deny') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return children;
}

function RedirectIfAdmin({ children }) {
  const [phase, setPhase] = useState(initialRedirectIfAdminPhase);

  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;
    (async () => {
      try {
        await refreshAdminAccessToken();
        if (!cancelled) setPhase('redirect');
      } catch (e) {
        if (cancelled) return;
        if (isRefreshAuthRevokedError(e)) {
          clearAdminAuth();
          setPhase('guest');
        } else {
          setPhase('guest');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (phase === 'redirect') return <Navigate to="/admin" replace />;
  return children;
}

/** Student refresh runs once from App bootstrap (`bootstrapStudentSession`); no /auth/refresh here (avoids duplicate in-flight refresh on reload). */
function RequireStudent({ children }) {
  return children;
}

export default function AppRouter() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<StudentLoginPage />} />
          <Route path="/register" element={<StudentRegisterPage />} />
          <Route path="/forgot-password" element={<StudentForgotPasswordPage />} />
          <Route path="/reset-password" element={<StudentResetPasswordPage />} />
          <Route path="/verify-email" element={<StudentVerifyOtpPage />} />
          <Route path="/verify-mrb" element={<StudentVerifyMrbPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/refund" element={<RefundPage />} />
          <Route path="/student" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <RequireStudent>
                <StudentLayout />
              </RequireStudent>
            }
          >
            <Route index element={<StudentPortalPage />} />
            <Route path="tests" element={<StudentTestsPage />} />
            <Route path="tests/history" element={<StudentTestHistoryPage />} />
            <Route path="lectures" element={<StudentLecturesPage />} />
            <Route path="lectures/:id" element={<StudentLecturePlayerPage />} />
            <Route path="results" element={<StudentResultsPage />} />
            <Route path="tests/:id/results/:attemptId" element={<StudentResultDetailPage />} />
            <Route path="questions" element={<StudentQuestionsPage />} />
            <Route path="questions/ask" element={<StudentAskQuestionPage />} />
            <Route path="questions/:id" element={<StudentQuestionDetailPage />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="notifications" element={<StudentNotificationsPage />} />
          </Route>
          <Route path="/tests/:slug" element={<PublicTestPage />} />
          <Route path="/tests/:slug/start" element={<RequireStudent><TestAttemptPage /></RequireStudent>} />
          <Route path="/tests/:slug/result" element={<RequireStudent><TestResultPage /></RequireStudent>} />
          <Route
            path="/admin/login"
            element={
              <RedirectIfAdmin>
                <AdminLoginPage />
              </RedirectIfAdmin>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="questions" element={<AdminQuestionsPage />} />
            <Route path="courses" element={<AdminCoursesPage />} />
            <Route path="courses/:id" element={<AdminCoursesPage />} />
            <Route path="lectures" element={<AdminLecturesPage />} />
            <Route path="lectures/:id" element={<AdminLecturesPage />} />
            <Route path="tests" element={<AdminTestsPage />} />
            <Route path="tests/:id" element={<AdminTestsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="mrb-codes" element={<AdminMrbCodesPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
