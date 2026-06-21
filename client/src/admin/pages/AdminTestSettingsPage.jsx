import { adminRoute } from '../../config/adminPaths';
import { Navigate, useParams } from 'react-router-dom';

export default function AdminTestSettingsPage() {
  const { testId } = useParams();
  return <Navigate to={adminRoute(`tests/${testId}/setup`)} replace />;
}
