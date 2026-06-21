import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { getAdminToken, getStoredUser, getTeacherToken } from '../auth/session';
import { adminRoute } from '../config/adminPaths';
import {
  buildStudentLoginRedirect,
  isStudentAuthFailure,
  terminateStudentSession,
} from '../student/utils/studentPortalAuth';
import AppShellSkeleton from '../components/ui/AppShellSkeleton';
import StudentPortalSkeleton from '../student/components/StudentPortalSkeleton';
import { isStudentPortalPath } from '../student/utils/studentThemeStorage';
import ScrollToTop from '../components/layout/ScrollToTop';
import MetaHead from '../components/seo/MetaHead';
import ProtectedRoute from './ProtectedRoute';

const HomePage = lazy(() => import('../pages/HomePage'));
const CoursesPage = lazy(() => import('../pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('../pages/CourseDetailPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const StudentLoginPage = lazy(() => import('../pages/StudentLoginPage'));
const StudentRegisterPage = lazy(() => import('../pages/StudentRegisterPage'));
const EnrollmentPage = lazy(() => import('../pages/EnrollmentPage'));
const EnrollmentPaymentPage = lazy(() => import('../pages/EnrollmentPaymentPage'));
const EnrollmentPaymentSuccessPage = lazy(() => import('../pages/EnrollmentPaymentSuccessPage'));
const EnrollmentPaymentFailedPage = lazy(() => import('../pages/EnrollmentPaymentFailedPage'));
const EnrollmentStatusPage = lazy(() => import('../pages/EnrollmentStatusPage'));
const StudentForgotPasswordPage = lazy(() => import('../pages/StudentForgotPasswordPage'));
const StudentResetPasswordPage = lazy(() => import('../pages/StudentResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../pages/VerifyEmailPage'));
const StudentPortalPage = lazy(() => import('../pages/StudentPortalPage'));
const StudentMyCoursePage = lazy(() => import('../pages/StudentMyCoursePage'));
const StudentTestsPage = lazy(() => import('../pages/StudentTestsPage'));
const StudentLecturesPage = lazy(() => import('../pages/StudentLecturesPage'));
const StudentResultsPage = lazy(() => import('../pages/StudentResultsPage'));
const StudentQuestionsPage = lazy(() => import('../pages/StudentQuestionsPage'));
const StudentQuestionDetailPage = lazy(() => import('../pages/StudentQuestionDetailPage'));
const StudentProfilePage = lazy(() => import('../pages/StudentProfilePage'));
const StudentSettingsPage = lazy(() => import('../pages/StudentSettingsPage'));
const StudentMyCoursesPage = lazy(() => import('../pages/StudentMyCoursesPage'));
const StudentNotificationsPage = lazy(() => import('../pages/StudentNotificationsPage'));
const StudentResultDetailPage = lazy(() => import('../pages/StudentResultDetailPage'));
const StudentLecturePlayerPage = lazy(() => import('../pages/StudentLecturePlayerPage'));
const StudentTestHistoryPage = lazy(() => import('../pages/StudentTestHistoryPage'));
const StudentLayout = lazy(() => import('../student/components/StudentLayout'));
const PublicTestPage = lazy(() => import('../pages/PublicTestPage'));
const TestAttemptPage = lazy(() => import('../pages/TestAttemptPage'));
const TestResultPage = lazy(() => import('../pages/TestResultPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const SearchPage = lazy(() => import('../pages/SearchPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const TermsPage = lazy(() => import('../pages/TermsPage'));
const RefundPage = lazy(() => import('../pages/RefundPage'));
const AdminLayout = lazy(() => import('../admin/components/AdminLayout'));
const AdminLoginPage = lazy(() => import('../admin/pages/AdminLoginPage'));
const AdminDashboardPage = lazy(() => import('../admin/pages/AdminDashboardPage'));
const AdminCoursesPage = lazy(() => import('../admin/pages/AdminCoursesPage'));
const AdminCourseSubjectsPage = lazy(() => import('../admin/pages/AdminCourseSubjectsPage'));
const AdminCourseBatchesPage = lazy(() => import('../admin/pages/AdminCourseBatchesPage'));
const AdminLecturesPage = lazy(() => import('../admin/pages/AdminLecturesPage'));
const AdminChaptersPage = lazy(() => import('../admin/pages/AdminChaptersPage'));
const AdminUsersPage = lazy(() => import('../admin/pages/AdminUsersPage'));
const AdminTeachersPage = lazy(() => import('../admin/pages/AdminTeachersPage'));
const AdminTeacherCreatePage = lazy(() => import('../admin/pages/AdminTeacherCreatePage'));
const AdminTeacherEditPage = lazy(() => import('../admin/pages/AdminTeacherEditPage'));
const AdminLogsPage = lazy(() => import('../admin/pages/AdminLogsPage'));
const AdminTestsPage = lazy(() => import('../admin/pages/AdminTestsPage'));
const AdminTestImportWizardPage = lazy(() => import('../admin/pages/AdminTestImportWizardPage'));
const AdminTestTransferPage = lazy(() => import('../admin/pages/AdminTestTransferPage'));
const AdminTestCreatePage = lazy(() => import('../admin/pages/AdminTestCreatePage'));
const AdminTestEditPage = lazy(() => import('../admin/pages/AdminTestEditPage'));
const AdminTestEditQuestionsPage = lazy(() => import('../admin/pages/AdminTestEditQuestionsPage'));
const AdminTestSetupPage = lazy(() => import('../admin/pages/AdminTestSetupPage'));
const AdminTestEditBasicInfoPage = lazy(() => import('../admin/pages/AdminTestEditBasicInfoPage'));
const AdminTestEditRulesPage = lazy(() => import('../admin/pages/AdminTestEditRulesPage'));
const AdminTestEditSettingsPage = lazy(() => import('../admin/pages/AdminTestEditSettingsPage'));
const AdminTestDetailsPage = lazy(() => import('../admin/pages/AdminTestDetailsPage'));
const AdminTestRulesPage = lazy(() => import('../admin/pages/AdminTestRulesPage'));
const AdminTestSettingsPage = lazy(() => import('../admin/pages/AdminTestSettingsPage'));
const QuizBuilderPage = lazy(() => import('../features/quiz-builder/pages/QuizBuilderPage'));
const AdminSettingsPage = lazy(() => import('../admin/pages/AdminSettingsPage'));
const AdminRemarksPage = lazy(() => import('../admin/pages/AdminRemarksPage'));
const AdminQaMonitoringPage = lazy(() => import('../admin/pages/AdminQaMonitoringPage'));
const AdminTeacherInsightsPage = lazy(() => import('../admin/pages/AdminTeacherInsightsPage'));
const AdminRegistrationsPage = lazy(() => import('../admin/pages/AdminRegistrationsPage'));
const TeacherLayout = lazy(() => import('../teacher/components/TeacherLayout'));
const TeacherLoginPage = lazy(() => import('../teacher/pages/TeacherLoginPage'));
const TeacherQuestionsPage = lazy(() => import('../teacher/pages/TeacherQuestionsPage'));
const TeacherQuestionDetailPage = lazy(() => import('../teacher/pages/TeacherQuestionDetailPage'));
const TeacherProfilePage = lazy(() => import('../teacher/pages/TeacherProfilePage'));

/** Legacy `/quiz-builder` URLs → canonical `/questions` (preserves query string). */
function QuizBuilderLegacyRedirect() {
  const { testId } = useParams();
  const location = useLocation();
  return <Navigate to={`${adminRoute(`tests/${testId}/questions`)}${location.search}`} replace />;
}

function RouteAwareFallback() {
  const location = useLocation();
  if (isStudentPortalPath(location.pathname)) {
    return <StudentPortalSkeleton />;
  }
  return <AppShellSkeleton />;
}

function PageFallback() {
  return <RouteAwareFallback />;
}

function RequireAdmin({ children, authStatus }) {
  const location = useLocation();
  if (authStatus === 'resolving') return <PageFallback />;
  const token = getAdminToken();
  if (!token) {
    return <Navigate to={adminRoute('login')} replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RedirectIfAdmin({ children }) {
  if (getAdminToken()) return <Navigate to={adminRoute()} replace />;
  return children;
}

/** Validates student session and enrollment via API before opening protected routes. */
function RequireStudent({ children, authStatus }) {
  const location = useLocation();
  const [gate, setGate] = useState({ status: 'loading' });

  useEffect(() => {
    if (authStatus === 'resolving') return;

    let cancelled = false;

    async function verifyAccess() {
      setGate({ status: 'loading' });

      try {
        const me = await studentApi.me();
        if (cancelled) return;

        if (me?.data?.isVerified !== true) {
          setGate({ status: 'verify_email' });
          return;
        }

        const enrollment = await studentApi.studentEnrollmentStatus();
        if (cancelled) return;

        const enrolled = enrollment?.data?.enrolled === true;
        if (!enrolled && location.pathname.startsWith('/dashboard')) {
          setGate({ status: 'enroll' });
          return;
        }

        setGate({ status: 'ok' });
      } catch (err) {
        if (cancelled) return;

        if (isStudentAuthFailure(err)) {
          terminateStudentSession();
          setGate({ status: 'login' });
          return;
        }

        setGate({
          status: 'error',
          message: err?.message || 'Unable to verify your student access.',
        });
      }
    }

    verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [authStatus, location.pathname]);

  if (authStatus === 'resolving' || gate.status === 'loading') return <StudentPortalSkeleton label="Verifying student access" />;

  if (gate.status === 'login') {
    return <Navigate to={buildStudentLoginRedirect(location.pathname, location.search)} replace />;
  }

  if (gate.status === 'verify_email') {
    return (
      <Navigate
        to="/verify-email"
        replace
        state={{ from: `${location.pathname}${location.search || ''}` }}
      />
    );
  }

  if (gate.status === 'enroll') {
    return <Navigate to="/enroll" replace />;
  }

  if (gate.status === 'error') {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          textAlign: 'center',
          color: 'var(--color-ink-400)',
        }}
      >
        {gate.message}
      </div>
    );
  }

  return children;
}

function RequireTeacher({ children, authStatus }) {
  const location = useLocation();
  if (authStatus === 'resolving') return <PageFallback />;
  const token = getTeacherToken();
  const teacher = getStoredUser('teacher_user');
  if (!token || !teacher?.id || teacher.role !== 'teacher') {
    const from = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    return <Navigate to={`/teacher/login?from=${from}`} replace />;
  }
  return children;
}

function RedirectIfTeacher({ children }) {
  if (getTeacherToken()) return <Navigate to="/teacher/questions" replace />;
  return children;
}

/** Redirect legacy dashboard question URLs to canonical /student/questions. */
function StudentQuestionsRedirect() {
  const location = useLocation();
  if (location.pathname.endsWith('/ask')) {
    return <Navigate to="/student/questions" replace />;
  }
  return <Navigate to={`/student/questions${location.search}`} replace />;
}

function StudentQuestionDetailRedirect() {
  const { id } = useParams();
  const location = useLocation();
  return <Navigate to={`/student/questions/${id}${location.search}`} replace />;
}

export default function AppRouter({ authStatus }) {
  const adminBase = adminRoute();

  return (
    <>
      <MetaHead />
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<StudentLoginPage />} />
          <Route path="/register" element={<StudentRegisterPage />} />
          <Route
            path="/enroll"
            element={
              <ProtectedRoute authStatus={authStatus}>
                <Navigate to="/courses" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enroll/:courseId"
            element={
              <ProtectedRoute authStatus={authStatus}>
                <EnrollmentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollment/payment"
            element={
              <ProtectedRoute authStatus={authStatus}>
                <EnrollmentPaymentPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollment/payment/success"
            element={
              <ProtectedRoute authStatus={authStatus}>
                <EnrollmentPaymentSuccessPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollment/payment/failed"
            element={
              <ProtectedRoute authStatus={authStatus}>
                <EnrollmentPaymentFailedPage />
              </ProtectedRoute>
            }
          />
          <Route path="/enrollment/status" element={<EnrollmentStatusPage />} />
          <Route path="/forgot-password" element={<StudentForgotPasswordPage />} />
          <Route path="/reset-password" element={<StudentResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/refund" element={<RefundPage />} />
          <Route
            path="/student"
            element={
              <RequireStudent authStatus={authStatus}>
                <StudentLayout />
              </RequireStudent>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="questions/thread/:threadId" element={<StudentQuestionsPage />} />
            <Route path="questions/:id" element={<StudentQuestionsPage />} />
            <Route path="questions" element={<StudentQuestionsPage />} />
          </Route>
          <Route
            path="/dashboard"
            element={
              <RequireStudent authStatus={authStatus}>
                <StudentLayout />
              </RequireStudent>
            }
          >
            <Route index element={<StudentPortalPage />} />
            <Route path="settings" element={<StudentSettingsPage />} />
            <Route path="settings/profile" element={<StudentProfilePage />} />
            <Route path="my-courses" element={<StudentMyCoursesPage />} />
            <Route path="my-course" element={<StudentMyCoursePage />} />
            <Route path="tests" element={<StudentTestsPage />} />
            <Route path="tests/history" element={<StudentTestHistoryPage />} />
            <Route path="lectures" element={<StudentLecturesPage />} />
            <Route path="lectures/:id" element={<StudentLecturePlayerPage />} />
            <Route path="results" element={<StudentResultsPage />} />
            <Route path="tests/:id/results/:attemptId" element={<StudentResultDetailPage />} />
            <Route path="questions" element={<StudentQuestionsRedirect />} />
            <Route path="questions/ask" element={<StudentQuestionsRedirect />} />
            <Route path="questions/:id" element={<StudentQuestionDetailRedirect />} />
            <Route path="profile" element={<Navigate to="/dashboard/settings/profile" replace />} />
            <Route path="notifications" element={<StudentNotificationsPage />} />
          </Route>
          <Route path="/tests/:slug" element={<PublicTestPage />} />
          <Route
            path="/tests/:slug/start"
            element={
              <RequireStudent authStatus={authStatus}>
                <TestAttemptPage />
              </RequireStudent>
            }
          />
          <Route
            path="/tests/:slug/result"
            element={
              <RequireStudent authStatus={authStatus}>
                <TestResultPage />
              </RequireStudent>
            }
          />
          <Route
            path="/teacher/login"
            element={
              <RedirectIfTeacher>
                <TeacherLoginPage />
              </RedirectIfTeacher>
            }
          />
          <Route
            path="/teacher"
            element={
              <RequireTeacher authStatus={authStatus}>
                <TeacherLayout />
              </RequireTeacher>
            }
          >
            <Route index element={<Navigate to="/teacher/questions" replace />} />
            <Route path="questions/thread/:threadId" element={<TeacherQuestionsPage />} />
            <Route path="questions/:questionId" element={<TeacherQuestionsPage />} />
            <Route path="questions" element={<TeacherQuestionsPage />} />
            <Route path="profile" element={<TeacherProfilePage />} />
          </Route>
          <Route
            path={`${adminBase}/login`}
            element={
              <RedirectIfAdmin>
                <AdminLoginPage />
              </RedirectIfAdmin>
            }
          />
          <Route
            path={adminBase}
            element={
              <RequireAdmin authStatus={authStatus}>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="question-bank/*" element={<Navigate to={adminRoute('tests')} replace />} />
            <Route path="courses" element={<AdminCoursesPage />} />
            <Route path="courses/:id" element={<AdminCoursesPage />} />
            <Route path="courses/:courseId/subjects" element={<AdminCourseSubjectsPage />} />
            <Route path="courses/:courseId/batches" element={<AdminCourseBatchesPage />} />
            <Route path="chapters" element={<AdminChaptersPage />} />
            <Route path="lectures" element={<AdminLecturesPage />} />
            <Route path="lectures/:id" element={<AdminLecturesPage />} />
            <Route path="tests/new" element={<AdminTestCreatePage />} />
            <Route path="tests/import" element={<AdminTestImportWizardPage />} />
            <Route path="tests/transfer" element={<AdminTestTransferPage />} />
            <Route path="tests/:testId/setup" element={<AdminTestSetupPage />} />
            <Route path="tests/:testId/edit" element={<AdminTestEditPage />} />
            <Route path="tests/:testId/edit/questions" element={<AdminTestEditQuestionsPage />} />
            <Route path="tests/:testId/edit/basic-info" element={<AdminTestEditBasicInfoPage />} />
            <Route path="tests/:testId/edit/rules" element={<AdminTestEditRulesPage />} />
            <Route path="tests/:testId/edit/settings" element={<AdminTestEditSettingsPage />} />
            <Route path="tests/:testId/details" element={<AdminTestDetailsPage />} />
            <Route path="tests/:testId/rules" element={<AdminTestRulesPage />} />
            <Route path="tests/:testId/settings" element={<AdminTestSettingsPage />} />
            <Route path="tests/:testId/questions" element={<QuizBuilderPage />} />
            <Route path="tests/:testId/quiz-builder" element={<QuizBuilderLegacyRedirect />} />
            <Route path="tests" element={<AdminTestsPage />} />
            <Route path="tests/:id" element={<AdminTestsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="teachers" element={<AdminTeachersPage />} />
            <Route path="teachers/create" element={<AdminTeacherCreatePage />} />
            <Route path="teachers/:teacherId/edit" element={<AdminTeacherEditPage />} />
            <Route path="qa-monitoring" element={<AdminQaMonitoringPage />} />
            <Route path="teacher-insights" element={<AdminTeacherInsightsPage />} />
            <Route path="remarks" element={<AdminRemarksPage />} />
            <Route path="registrations" element={<AdminRegistrationsPage />} />
            <Route path="logs" element={<AdminLogsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
          <Route path="/admin" element={<NotFoundPage />} />
          <Route path="/admin/*" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
