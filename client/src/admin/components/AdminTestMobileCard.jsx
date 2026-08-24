import { Link } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import TestRowActionsMenu from './TestRowActionsMenu';
import TestStatusBadge from './TestStatusBadge';
import {
  formatAvgScoreCell,
  formatTestEditedCreatedLine,
} from '../utils/testListFormatting';

export default function AdminTestMobileCard({
  test,
  onPublish,
  onDuplicate,
  onDownloadResults,
  onExportTest,
  onDelete,
  onCopyLink,
  busyAction = '',
}) {
  const scoreCell = formatAvgScoreCell(test);

  return (
    <article className="admin-test-mobile-card">
      <header className="admin-test-mobile-card__header">
        <h3 className="admin-test-mobile-card__title">
          <Link to={adminRoute(`tests/${test.id}/dashboard`)}>{test.title}</Link>
        </h3>
        <TestStatusBadge status={test.status} />
      </header>

      <p className="admin-test-mobile-card__dates">{formatTestEditedCreatedLine(test)}</p>

      <dl className="admin-test-mobile-card__meta">
        <div>
          <dt>Questions</dt>
          <dd>{Number(test.questionCount ?? 0)}</dd>
        </div>
        <div>
          <dt>Scores</dt>
          <dd>{Number(test.scoresCount ?? 0)}</dd>
        </div>
        <div>
          <dt>Avg score</dt>
          <dd>
            {scoreCell.avg}
            {scoreCell.range ? <span className="admin-test-mobile-card__score-range"> {scoreCell.range}</span> : null}
          </dd>
        </div>
      </dl>

      {test.publicLink ? (
        <div className="admin-tests-link-actions admin-test-mobile-card__links">
          <a href={test.publicLink} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
            Open public link
          </a>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => onCopyLink(test.publicLink)}>
            Copy link
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
