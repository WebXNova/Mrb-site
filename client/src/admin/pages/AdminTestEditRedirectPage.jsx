import { adminRoute } from '../../config/adminPaths';
import { Navigate, useParams } from 'react-router-dom';

/** Legacy edit routes → unified setup page. */
export default function AdminTestEditRedirectPage() {
  const { testId } = useParams();
  return <Navigate to={adminRoute(`tests/${testId}/setup`)} replace />;
}
