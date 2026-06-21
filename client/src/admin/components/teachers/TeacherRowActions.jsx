import { adminRoute } from '../../../config/adminPaths';
import { Link } from 'react-router-dom';
import AdminActionMenu, { AdminActionMenuItem } from '../AdminActionMenu';

export default function TeacherRowActions({ teacher, onActivate, onDeactivate, busy }) {
  const isActive = String(teacher.status || '').toLowerCase() === 'active';
  const isBusy = Boolean(busy);

  return (
    <div className="admin-teacher-row-actions">
      <Link
        className="btn btn--secondary btn--sm admin-touch-target"
        to={adminRoute(`teachers/${teacher.id}/edit`)}
      >
        Edit
      </Link>
      <AdminActionMenu triggerLabel="More" align="right">
        {({ close }) =>
          isActive ? (
            <AdminActionMenuItem
              className="admin-action-menu__item--danger"
              disabled={isBusy}
              onClick={() => {
                close();
                onDeactivate(teacher);
              }}
            >
              Deactivate
            </AdminActionMenuItem>
          ) : (
            <AdminActionMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onActivate(teacher);
              }}
            >
              Activate
            </AdminActionMenuItem>
          )
        }
      </AdminActionMenu>
    </div>
  );
}
