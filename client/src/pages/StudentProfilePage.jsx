import { Link } from 'react-router-dom';
import { getStoredUser } from '../auth/session';
import { useStudentSessions } from '../student/hooks/useStudentSessions';
import '../student/styles/student-settings.css';

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function statusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'revoked') return 'Revoked';
  if (status === 'expired') return 'Expired';
  return 'Unknown';
}

export default function StudentProfilePage() {
  const student = getStoredUser('student_user') || {};
  const { activeSessions, loading, error } = useStudentSessions();

  const profileFields = [
    { label: 'Username', value: student.username || '—' },
    { label: 'Full Name', value: student.fullName || '—' },
    { label: 'Email', value: student.email || '—' },
    { label: 'Role', value: student.role || 'student' },
    {
      label: 'Student ID',
      value: student.id ? `MRB-${String(student.id).padStart(5, '0')}` : '—',
    },
  ];

  return (
    <section className="sp-settings sp-profile-page">
      <nav className="sp-settings__breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard/settings" className="sp-settings__back">
          ← Settings
        </Link>
      </nav>

      <header className="sp-settings__header sp-animate-in sp-animate-in--0">
        <p className="sp-label">Account</p>
        <h1 className="sp-settings__title">Profile</h1>
        <p className="sp-settings__subtitle">
          Signed in as <strong>{student.username || student.fullName || 'Student'}</strong> — your
          account details and active sessions.
        </p>
      </header>

      <article className="sp-profile-card sp-card sp-animate-in sp-animate-in--1">
        <h2 className="sp-profile-card__title">Personal information</h2>
        <dl className="sp-profile-fields">
          {profileFields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </article>

      <article className="sp-profile-card sp-card sp-animate-in sp-animate-in--2">
        <h2 className="sp-profile-card__title">Active sessions</h2>
        <p className="sp-body sp-profile-sessions__intro">
          Only sessions linked to your account are shown here.
        </p>

        {loading ? (
          <p className="sp-body">Loading your sessions…</p>
        ) : error ? (
          <p className="sp-body sp-body--error">{error}</p>
        ) : activeSessions.length === 0 ? (
          <p className="sp-body">No active sessions found for your account.</p>
        ) : (
          <div className="sp-profile-sessions">
            {activeSessions.map((session) => (
              <article key={session.id} className="sp-profile-session-card">
                <div className="sp-profile-session-card__head">
                  <div className="sp-profile-session-card__title-row">
                    <h3 className="sp-profile-session-card__title">{session.device}</h3>
                    {session.isCurrent ? (
                      <span className="sp-badge sp-badge--soft-sage">This device</span>
                    ) : null}
                  </div>
                  <span className="sp-badge sp-badge--soft-sage">{statusLabel(session.status)}</span>
                </div>
                <dl className="sp-profile-session-card__meta">
                  <div>
                    <dt>Signed in</dt>
                    <dd>{formatDateTime(session.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd>{formatDateTime(session.lastUsedAt)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatDateTime(session.expiresAt)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
