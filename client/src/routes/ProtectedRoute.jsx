import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredUser, getStudentToken } from '../auth/session';
import AppShellSkeleton from '../components/ui/AppShellSkeleton';

function AuthRouteFallback() {
  return <AppShellSkeleton label="Verifying session" />;
}

export default function ProtectedRoute({ children, authStatus = 'authenticated' }) {
  const location = useLocation();
  if (authStatus === 'resolving') return <AuthRouteFallback />;
  const token = getStudentToken();
  const student = getStoredUser('student_user');

  if (!token || !student?.id) {
    const from = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return children || <Outlet />;
}
