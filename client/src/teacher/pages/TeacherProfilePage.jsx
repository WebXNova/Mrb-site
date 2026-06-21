import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teacherApi } from '../../api/teacherApi';
import { teacherLogout } from '../components/TeacherLayout';
import TeacherStatusBadge from '../../admin/components/teachers/TeacherStatusBadge';
import TeacherSubjectChips from '../../admin/components/teachers/TeacherSubjectChips';
import '../../admin/styles/admin-teachers.css';

function ProfileSkeleton() {
  return (
    <section className="admin-card" aria-busy="true" aria-label="Loading profile">
      <h2 className="heading-3">Profile</h2>
      <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
        <table className="admin-table">
          <tbody>
            {['Full Name', 'Email', 'Username', 'Assigned Subjects', 'Account Status'].map((label) => (
              <tr key={label}>
                <th>{label}</th>
                <td>Loading…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function TeacherProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await teacherApi.profile();
        if (!cancelled) setProfile(response?.data || null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await teacherLogout(navigate);
  }

  if (loading) return <ProfileSkeleton />;

  if (error) {
    return (
      <section className="admin-card">
        <h2 className="heading-3">Profile</h2>
        <p className="admin-error" style={{ marginTop: '1rem' }} role="alert">
          {error}
        </p>
      </section>
    );
  }

  const profileFields = [
    { label: 'Full Name', value: profile?.fullName || '—' },
    { label: 'Email', value: profile?.email || '—' },
    { label: 'Username', value: profile?.username || '—' },
  ];

  return (
    <section className="admin-card">
      <h2 className="heading-3">Profile</h2>
      <p className="admin-stat-card__label" style={{ marginTop: '0.35rem' }}>
        Read-only view of your account details.
      </p>

      <div className="admin-table-wrap student-profile-table" style={{ marginTop: '1rem' }}>
        <table className="admin-table">
          <tbody>
            {profileFields.map((field) => (
              <tr key={field.label}>
                <th>{field.label}</th>
                <td>{field.value}</td>
              </tr>
            ))}
            <tr>
              <th>Assigned Subjects</th>
              <td>
                <TeacherSubjectChips subjects={profile?.assignedSubjectTitles} maxVisible={12} />
              </td>
            </tr>
            <tr>
              <th>Account Status</th>
              <td>
                <TeacherStatusBadge status={profile?.status} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul className="student-profile-list">
        {profileFields.map((field) => (
          <li key={field.label} className="student-profile-list__item">
            <span className="student-profile-list__label">{field.label}</span>
            <span className="student-profile-list__value">{field.value}</span>
          </li>
        ))}
        <li className="student-profile-list__item">
          <span className="student-profile-list__label">Assigned Subjects</span>
          <span className="student-profile-list__value">
            <TeacherSubjectChips subjects={profile?.assignedSubjectTitles} maxVisible={12} />
          </span>
        </li>
        <li className="student-profile-list__item">
          <span className="student-profile-list__label">Account Status</span>
          <span className="student-profile-list__value">
            <TeacherStatusBadge status={profile?.status} />
          </span>
        </li>
      </ul>

      <div className="teacher-profile__logout">
        <button
          type="button"
          className="btn btn--secondary teacher-profile__logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? 'Signing out…' : 'Logout'}
        </button>
      </div>
    </section>
  );
}
