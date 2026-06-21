import { adminRoute } from '../../../config/adminPaths';
import { Link } from 'react-router-dom';
import TeacherStatusBadge from './TeacherStatusBadge';
import TeacherSubjectChips from './TeacherSubjectChips';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function AdminTeacherMobileCard({ teacher, onActivate, onDeactivate, busy }) {
  const isActive = String(teacher.status || '').toLowerCase() === 'active';

  return (
    <article className="admin-teacher-mobile-card">
      <div className="admin-teacher-mobile-card__head">
        <div>
          <h3 className="admin-teacher-mobile-card__name">{teacher.fullName || 'Unnamed teacher'}</h3>
          <p className="admin-teacher-mobile-card__meta">{teacher.email}</p>
          <p className="admin-teacher-mobile-card__meta">@{teacher.username || '—'}</p>
        </div>
        <TeacherStatusBadge status={teacher.status} />
      </div>

      <dl className="admin-teacher-mobile-card__details">
        <div>
          <dt>Subjects</dt>
          <dd>
            <TeacherSubjectChips subjects={teacher.assignedSubjectTitles} />
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(teacher.createdAt)}</dd>
        </div>
      </dl>

      <div className="admin-teacher-mobile-card__actions">
        <Link className="btn btn--secondary btn--sm admin-touch-target" to={adminRoute(`teachers/${teacher.id}/edit`)}>
          Edit
        </Link>
        {isActive ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm admin-touch-target"
            disabled={busy}
            onClick={() => onDeactivate(teacher)}
          >
            Deactivate
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--secondary btn--sm admin-touch-target"
            disabled={busy}
            onClick={() => onActivate(teacher)}
          >
            Activate
          </button>
        )}
      </div>
    </article>
  );
}
