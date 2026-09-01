import { Link } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import SeatInventoryMeter from './SeatInventoryMeter';
import TestRowActionsMenu from './TestRowActionsMenu';
import TestAdminBadges from './TestAdminBadges';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import {
  formatAvgScoreCell,
  formatTestEditedCreatedLine,
} from '../utils/testListFormatting';
import {
  formatCourseLabel,
  formatScheduleWindow,
  formatTestAccessTypeLabel,
} from '../utils/testAdminDisplay.js';

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
  const standalone = isStandaloneAccessType(test.testAccessType);
  const windowLabel = formatScheduleWindow(test);

  return (
    <article className="admin-test-mobile-card">
      <header className="admin-test-mobile-card__header">
        <h3 className="admin-test-mobile-card__title">
          <Link to={adminRoute(`tests/${test.id}/dashboard`)}>{test.title}</Link>
        </h3>
      </header>

      <TestAdminBadges test={test} />

      <p className="admin-test-mobile-card__dates">{formatTestEditedCreatedLine(test)}</p>
      {standalone && windowLabel ? <p className="admin-test-mobile-card__dates">{windowLabel}</p> : null}

      <dl className="admin-test-mobile-card__meta">
        <div>
          <dt>Type</dt>
          <dd>{formatTestAccessTypeLabel(test.testAccessType)}</dd>
        </div>
        <div>
          <dt>Course</dt>
          <dd>{standalone ? '—' : formatCourseLabel(test)}</dd>
        </div>
        <div>
          <dt>Questions</dt>
          <dd>{Number(test.questionCount ?? 0)}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{Number(test.scoresCount ?? 0)}</dd>
        </div>
        <div>
          <dt>Avg score</dt>
          <dd>
            {scoreCell.avg}
            {scoreCell.range ? <span className="admin-test-mobile-card__score-range"> {scoreCell.range}</span> : null}
          </dd>
        </div>
        {standalone ? (
          <div className="admin-test-mobile-card__seats">
            <dt>Seats</dt>
            <dd>
              <SeatInventoryMeter test={test} compact />
            </dd>
          </div>
        ) : null}
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
