import { getStoredUser } from '../auth/session';
import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentProfilePage() {
  const student = getStoredUser('student_user') || {};

  return (
    <section className="admin-card">
      <h2 className="heading-3">Profile</h2>
      <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
        <table className="admin-table">
          <tbody>
            <tr>
              <th>Full Name</th>
              <td>{student.fullName || '-'}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>{student.email || '-'}</td>
            </tr>
            <tr>
              <th>Role</th>
              <td>{student.role || 'student'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3 className="heading-4" style={{ marginTop: '1rem' }}>Active Sessions</h3>
      <div className="admin-table-wrap" style={{ marginTop: '0.6rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Device</th><th>Last Seen</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {mockStudentDashboard.sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.device}</td>
                <td>{session.lastSeen}</td>
                <td>{session.status}</td>
                <td><button type="button" className="btn btn--secondary btn--sm">Revoke</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-stat-card__label" style={{ marginTop: '0.75rem' }}>
        Session revoke action is in frontend preview mode and will connect to API later.
      </p>
    </section>
  );
}
