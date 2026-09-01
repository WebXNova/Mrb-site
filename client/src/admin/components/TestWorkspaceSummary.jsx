import { Link } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import SeatInventoryMeter from './SeatInventoryMeter';
import TestAdminBadges from './TestAdminBadges';
import {
  formatAdminDateTime,
  formatCourseLabel,
  formatPkrAmount,
  formatTestAccessTypeLabel,
} from '../utils/testAdminDisplay.js';

function SummaryItem({ label, value, hint, children }) {
  if ((value == null || value === '') && !children) return null;
  return (
    <div className="test-workspace-summary__item">
      <dt>{label}</dt>
      <dd>
        {children || value}
        {hint ? <span className="test-workspace-summary__hint">{hint}</span> : null}
      </dd>
    </div>
  );
}

/**
 * Compact identity strip for every test workspace page.
 */
export default function TestWorkspaceSummary({ test }) {
  if (!test) return null;

  const accessType = test.testAccessType || test.test_access_type || 'course_locked';
  const standalone = isStandaloneAccessType(accessType);
  const paid = accessType === 'paid_standalone';

  return (
    <div className="test-workspace-summary">
      <TestAdminBadges test={test} />
      <dl className="test-workspace-summary__grid">
        <SummaryItem label="Type" value={formatTestAccessTypeLabel(accessType)} />
        {standalone ? null : <SummaryItem label="Course" value={formatCourseLabel(test)} />}
        {paid ? <SummaryItem label="Price" value={formatPkrAmount(test.pricePkr ?? test.price_pkr)} /> : null}
        {standalone ? (
          <SummaryItem label="Starts" value={formatAdminDateTime(test.startDate ?? test.start_date)} />
        ) : null}
        {standalone ? (
          <SummaryItem label="Ends" value={formatAdminDateTime(test.endDate ?? test.end_date)} />
        ) : null}
        {standalone ? (
          <SummaryItem label="Seats" hint={paid ? 'Confirmed payments only' : null}>
            <SeatInventoryMeter test={test} compact />
          </SummaryItem>
        ) : null}
        <SummaryItem label="Attempts" value={String(Number(test.scoresCount ?? test.scores_count ?? 0))} />
      </dl>
      {paid ? (
        <p className="test-workspace-summary__link">
          <Link to={`${adminRoute('standalone-test-payments')}?testId=${test.id}`}>
            Review paid registrations
          </Link>
        </p>
      ) : null}
    </div>
  );
}
