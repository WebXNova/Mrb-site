import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import { isAnyPublishBusy, isTestPublishBusy, publishMenuLabel } from '../utils/testPublishBusyState';
import AdminActionMenu, {
  AdminActionMenuDivider,
  AdminActionMenuItem,
} from './AdminActionMenu';

export default function TestRowActionsMenu({
  test,
  onPublish,
  onDuplicate,
  onDownloadResults,
  onExportTest,
  onDelete,
  onCopyLink,
  busyAction = '',
}) {
  const published = isTestPublishedStatus(test.status);
  const publishing = isAnyPublishBusy(busyAction);
  const publishingThisTest = isTestPublishBusy(busyAction, test.id);
  const exportBusy = busyAction === `export-csv-${test.id}`;

  return (
    <div className="admin-tests-row-actions" aria-busy={publishingThisTest || exportBusy || undefined}>
      {published ? (
        <Link
          className="btn btn--primary btn--sm admin-touch-target"
          to={adminRoute(`tests/${test.id}/edit`)}
        >
          Edit
        </Link>
      ) : null}
      <Link
        className="btn btn--secondary btn--sm admin-touch-target"
        to={adminRoute(`tests/${test.id}/setup`)}
      >
        {published ? 'View setup' : 'Setup'}
      </Link>
      <Link
        className={`btn btn--sm admin-touch-target${published ? ' btn--secondary' : ' btn--primary'}`}
        to={adminRoute(`tests/${test.id}/questions`)}
        aria-busy={busyAction === 'questions' || undefined}
      >
        {busyAction === 'questions' ? 'Loading…' : published ? 'View questions' : 'Questions'}
      </Link>
      <button
        type="button"
        className="btn btn--secondary btn--sm admin-touch-target"
        disabled={exportBusy}
        aria-busy={exportBusy || undefined}
        onClick={() => onExportTest(test.id)}
      >
        {exportBusy ? 'Exporting…' : '📥 Export CSV'}
      </button>

      <AdminActionMenu triggerLabel="More" triggerClassName="btn btn--secondary btn--sm admin-touch-target">
        {({ close }) => (
          <>
            <AdminActionMenuItem as={Link} to={adminRoute(`tests/${test.id}/details`)} onClick={close}>
              Publish
            </AdminActionMenuItem>
            <AdminActionMenuDivider />
            {!published ? (
              <AdminActionMenuItem
                disabled={publishing}
                aria-busy={publishingThisTest || undefined}
                aria-disabled={publishing || undefined}
                onClick={() => {
                  if (publishing) return;
                  close();
                  onPublish(test.id);
                }}
                className="admin-action-menu__item--primary"
              >
                {publishMenuLabel(busyAction, test.id)}
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
                onDownloadResults(test.id, 'xlsx');
              }}
            >
              Download as XLSX
            </AdminActionMenuItem>
            <AdminActionMenuItem
              onClick={() => {
                close();
                onDownloadResults(test.id, 'csv');
              }}
            >
              Download as CSV
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
            {!published ? (
              <AdminActionMenuItem
                onClick={() => {
                  close();
                  onDelete(test);
                }}
                className="admin-action-menu__item--danger"
              >
                Delete test
              </AdminActionMenuItem>
            ) : null}
          </>
        )}
      </AdminActionMenu>
    </div>
  );
}
