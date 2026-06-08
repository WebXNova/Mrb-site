import { Navigate, useParams } from 'react-router-dom';

/** Legacy /admin/tests/:id/edit → basic-info step. */
export default function AdminTestEditRedirectPage() {
  const { testId } = useParams();
  return <Navigate to={`/admin/tests/${testId}/edit/basic-info`} replace />;
}
