import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredUser, getStudentToken } from '../auth/session';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = getStudentToken();
  const student = getStoredUser('student_user');

  if (!token || !student?.id) {
    const from = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return children || <Outlet />;
}
