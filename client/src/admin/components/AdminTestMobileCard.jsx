import { Link } from 'react-router-dom';
import TestRowActionsMenu from './TestRowActionsMenu';
import TestStatusBadge from './TestStatusBadge';

export default function AdminTestMobileCard({
  test,
  courseTitle,
  onPublish,
  onDuplicate,
  onDownloadResults,
  onExportTest,
  onDelete,
  onCopyLink,
  busyAction = '',
}) {
  return (
    <article className="admin-test-mobile-card">
      <header className="admin-test-mobile-card__header">
        <h3 className="admin-test-mobile-card__title">{test.title}</h3>
        <TestStatusBadge status={test.status} />
      </header>

      {courseTitle ? <p className="admin-test-mobile-card__course">{courseTitle}</p> : null}

      <dl className="admin-test-mobile-card__meta">
        <div>
          <dt>Category</dt>
          <dd>{test.category || 'MDCAT'}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{test.durationMinutes != null ? `${test.durationMinutes} min` : '—'}</dd>
        </div>
      </dl>

      {test.publicLink ? (
        <div className="admin-tests-link-actions admin-test-mobile-card__links">
          <a href={test.publicLink} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
            Open
          </a>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => onCopyLink(test.publicLink)}>
            Copy
          </button>
        </div>
      ) : null}

      <div className="admin-test-mobile-card__actions">
        <TestRowActionsMenu
          test={test}
          onPublish={onPublish}
          onDuplicate={onDuplicate}
          onDownloadResults={onDownloadResults}
          onExportTest={onExportTest}
          onDelete={onDelete}
          onCopyLink={onCopyLink}
          busyAction={busyAction}
        />
      </div>
    </article>
  );
}
