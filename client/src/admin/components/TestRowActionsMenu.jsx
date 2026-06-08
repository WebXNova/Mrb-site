import { Link } from 'react-router-dom';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import AdminActionMenu, {
  AdminActionMenuDivider,
  AdminActionMenuItem,
  AdminActionMenuLabel,
} from './AdminActionMenu';

export default function TestRowActionsMenu({
  test,
  onPublish,
  onDuplicate,
  onDownloadResults,
  onDelete,
  onCopyLink,
  busyAction = '',
}) {
  const published = isTestPublishedStatus(test.status);

  return (
    <div className="admin-tests-row-actions">
      <Link
        className="btn btn--secondary btn--sm admin-touch-target"
        to={`/admin/tests/${test.id}/edit/basic-info`}
      >
        Edit
      </Link>
      <Link
        className="btn btn--primary btn--sm admin-touch-target"
        to={`/admin/tests/${test.id}/questions`}
        aria-busy={busyAction === 'questions' || undefined}
      >
        {busyAction === 'questions' ? 'Loading…' : 'Questions'}
      </Link>
      <button
        className="btn btn--danger btn--sm admin-touch-target"
        type="button"
        onClick={() => onDelete(test)}
        disabled={busyAction === 'delete'}
      >
        {busyAction === 'delete' ? 'Deleting…' : 'Delete'}
      </button>

      <AdminActionMenu triggerLabel="More" triggerClassName="btn btn--secondary btn--sm admin-touch-target">
        {({ close }) => (
          <>
            <AdminActionMenuItem as={Link} to={`/admin/tests/${test.id}/details`} onClick={close}>
              Details
            </AdminActionMenuItem>
            <AdminActionMenuDivider />
            <AdminActionMenuLabel>Edit steps</AdminActionMenuLabel>
            <AdminActionMenuItem as={Link} to={`/admin/tests/${test.id}/edit/basic-info`} onClick={close}>
              Basic Info
            </AdminActionMenuItem>
            <AdminActionMenuItem as={Link} to={`/admin/tests/${test.id}/edit/rules`} onClick={close}>
              Rules & Scoring
            </AdminActionMenuItem>
            <AdminActionMenuItem as={Link} to={`/admin/tests/${test.id}/edit/settings`} onClick={close}>
              Settings & Access
            </AdminActionMenuItem>
            <AdminActionMenuDivider />
            <AdminActionMenuLabel>Test</AdminActionMenuLabel>
            {!published ? (
              <AdminActionMenuItem
                onClick={() => {
                  close();
                  onPublish(test.id);
                }}
                className="admin-action-menu__item--primary"
              >
                Publish
              </AdminActionMenuItem>
            ) : null}
            <AdminActionMenuItem
              onClick={() => {
                close();
                onDuplicate(test.id);
              }}
            >
              Duplicate
            </AdminActionMenuItem>
            <AdminActionMenuItem
              onClick={() => {
                close();
                onDownloadResults(test.id);
              }}
            >
              Download results
            </AdminActionMenuItem>
            {test.publicLink ? (
              <>
                <AdminActionMenuDivider />
                <AdminActionMenuItem
                  as="a"
                  href={test.publicLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={close}
                >
                  Open public link
                </AdminActionMenuItem>
                <AdminActionMenuItem
                  onClick={() => {
                    close();
                    onCopyLink(test.publicLink);
                  }}
                >
                  Copy public link
                </AdminActionMenuItem>
              </>
            ) : null}
            <AdminActionMenuDivider />
            <AdminActionMenuItem
              onClick={() => {
                close();
                onDelete(test);
              }}
              className="admin-action-menu__item--danger"
            >
              Delete test
            </AdminActionMenuItem>
          </>
        )}
      </AdminActionMenu>
    </div>
  );
}
