import TestStatusBadge from './TestStatusBadge';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import {
  formatAvailabilityLabel,
  formatResultsReleaseLabel,
  formatTestAccessTypeLabel,
  getResultsReleaseState,
  getTestAvailabilityState,
  getTestOpenClosedState,
} from '../utils/testAdminDisplay.js';

function Chip({ variant, children }) {
  if (!children) return null;
  return <span className={`admin-test-status admin-test-status--${variant}`}>{children}</span>;
}

function typeVariant(accessType) {
  if (accessType === 'paid_standalone') return 'type-paid';
  if (accessType === 'free_standalone') return 'type-free';
  return 'type-course';
}

function availabilityVariant(state) {
  if (state === 'live') return 'live';
  if (state === 'scheduled') return 'scheduled';
  if (state === 'ended') return 'ended';
  if (state === 'full') return 'full';
  if (state === 'closed' || state === 'private') return 'closed';
  return 'default';
}

/**
 * Compact badge row: lifecycle, access type, availability, results.
 */
export default function TestAdminBadges({ test, showStatus = true, showType = true, showAvailability = true, showResults = true }) {
  const accessType = String(test?.testAccessType || test?.test_access_type || 'course_locked');
  const availability = getTestAvailabilityState(test);
  const results = getResultsReleaseState(test);
  const standalone = isStandaloneAccessType(accessType);
  const openClosed = getTestOpenClosedState(test);

  return (
    <div className="test-admin-badges">
      {showStatus ? <TestStatusBadge status={test?.status} /> : null}
      {showType ? <Chip variant={typeVariant(accessType)}>{formatTestAccessTypeLabel(accessType)}</Chip> : null}
      {standalone ? (
        <Chip variant={openClosed === 'open' ? 'live' : 'closed'}>
          {openClosed === 'open' ? 'Open' : 'Closed'}
        </Chip>
      ) : null}
      {showAvailability && availability ? (
        <Chip variant={availabilityVariant(availability)}>{formatAvailabilityLabel(availability)}</Chip>
      ) : null}
      {showResults && results !== 'none' ? (
        <Chip variant={results === 'published' ? 'results-published' : 'results-pending'}>
          {formatResultsReleaseLabel(results)}
        </Chip>
      ) : null}
    </div>
  );
}
