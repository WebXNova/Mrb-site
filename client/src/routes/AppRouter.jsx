import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ScrollToTop from '../components/layout/ScrollToTop';

const HomePage = lazy(() => import('../pages/HomePage'));
const CoursesPage = lazy(() => import('../pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('../pages/CourseDetailPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const ContactPage = lazy(() => import('../pages/ContactPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
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

export default function AppRouter() {
  const token = localStorage.getItem('admin_access_token');

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
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin"
            element={token ? <AdminLayout /> : <Navigate to="/admin/login" replace />}
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="courses" element={<AdminCoursesPage />} />
            <Route path="lectures" element={<AdminLecturesPage />} />
            <Route path="tests" element={<AdminTestsPage />} />
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
