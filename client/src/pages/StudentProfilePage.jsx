import { getStoredUser } from '../auth/session';

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
    </section>
  );
}
