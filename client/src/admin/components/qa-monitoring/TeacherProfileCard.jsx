import { motion } from 'framer-motion';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatWhen(iso);
}

/**
 * @param {{
 *   teacher: Record<string, unknown>|null,
 *   overview?: boolean,
 *   lastActivity?: string|null,
 *   loading?: boolean,
 * }} props
 */
export default function TeacherProfileCard({
  teacher,
  overview = false,
  lastActivity = null,
  loading = false,
}) {
  if (loading) {
    return <div className="qa-skeleton qa-skeleton--profile" aria-busy="true" aria-label="Loading profile" />;
  }

  const name = overview
    ? 'All Teachers'
    : teacher?.fullName || teacher?.name || `Teacher #${teacher?.id ?? ''}`;
  const email = overview ? 'System-wide monitoring view' : teacher?.email || '—';
  const subjects = overview
    ? ['All subjects']
    : Array.isArray(teacher?.assignedSubjectTitles) && teacher.assignedSubjectTitles.length
      ? teacher.assignedSubjectTitles
      : ['No subjects assigned'];
  const status = overview ? 'active' : String(teacher?.status || 'active');
  const joined = overview ? '—' : formatWhen(teacher?.createdAt);
  const last = lastActivity || teacher?.lastActivity;

  const statusDotClass =
    status === 'suspended'
      ? 'qa-profile__status-dot--suspended'
      : status === 'inactive'
        ? 'qa-profile__status-dot--inactive'
        : '';

  return (
    <motion.section
      className="qa-profile"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={`qa-profile__avatar${overview ? ' qa-profile__avatar--overview' : ''}`}>
        {overview ? '∑' : initials(name)}
      </div>

      <div className="qa-profile__main">
        <h2>{name}</h2>
        <p className="qa-profile__email">{email}</p>
        <div className="qa-profile__subjects">
          {subjects.map((s) => (
            <span key={s} className="qa-profile__subject-pill">
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="qa-profile__meta">
        {!overview ? (
          <div className="qa-profile__meta-item">
            <span className="qa-profile__meta-label">Status</span>
            <span className="qa-profile__meta-value qa-profile__status">
              <span className={`qa-profile__status-dot ${statusDotClass}`} />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        ) : null}
        <div className="qa-profile__meta-item">
          <span className="qa-profile__meta-label">Joined</span>
          <span className="qa-profile__meta-value">{joined}</span>
        </div>
        <div className="qa-profile__meta-item">
          <span className="qa-profile__meta-label">Last active</span>
          <span className="qa-profile__meta-value">{formatRelative(last)}</span>
        </div>
      </div>
    </motion.section>
  );
}
