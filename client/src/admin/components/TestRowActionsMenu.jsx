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
  const resultsBusy = busyAction === `results-${test.id}-xlsx`;

  const questionsLabel =
    busyAction === 'questions' ? 'Loading…' : 'Questions';

  return (
    <div className="tests-row-actions" aria-busy={publishingThisTest || exportBusy || resultsBusy || undefined}>
      {published ? (
        <Link className="tests-row-actions__primary" to={adminRoute(`tests/${test.id}/dashboard`)}>
          Open
        </Link>
      ) : (
        <Link className="tests-row-actions__primary" to={adminRoute(`tests/${test.id}/dashboard`)}>
          Setup
        </Link>
      )}

      {published ? (
        <Link
          className="tests-row-actions__link"
          to={adminRoute(`tests/${test.id}/settings`)}
          title="View settings"
        >
          Settings
        </Link>
      ) : null}

      <Link
        className="tests-row-actions__link"
        to={adminRoute(`tests/${test.id}/questions`)}
        title={published ? 'View questions' : 'Questions'}
        aria-busy={busyAction === 'questions' || undefined}
      >
        {questionsLabel}
      </Link>

      <AdminActionMenu triggerLabel="More" triggerClassName="tests-row-actions__more">
        {({ close }) => (
          <>
            <AdminActionMenuItem as={Link} to={adminRoute(`tests/${test.id}/publish`)} onClick={close}>
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
              disabled={exportBusy}
              aria-busy={exportBusy || undefined}
              onClick={() => {
                if (exportBusy) return;
                close();
                onExportTest(test.id);
              }}
            >
              {exportBusy ? 'Exporting…' : 'Export CSV'}
            </AdminActionMenuItem>
            <AdminActionMenuItem
              onClick={() => {
                close();
                onDownloadResults(test.id);
              }}
            >
              Download Result
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
