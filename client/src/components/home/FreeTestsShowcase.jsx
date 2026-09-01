import { useEffect, useState } from 'react';
import { standaloneTestsApi } from '../../api/standaloneTestsApi';
import { formatSeatRemaining } from '../../utils/testSeatCopy';
import {
  catalogAvailability,
  formatStandaloneDateTime,
  resolveCatalogCardAction,
} from '../../utils/testCatalogAvailability';
import HomeTestCard, { HomeTestCardSkeleton } from './HomeTestCard';
import TestsEmptyState from '../public-tests/TestsEmptyState.jsx';
import TestsCatalogSection from '../public-tests/TestsCatalogSection.jsx';

function seatValue(test) {
  if (test.seatsUnlimited) return null;
  const remaining = Number(test.seatsRemaining);
  if (!Number.isFinite(remaining)) return null;
  return remaining < 0 ? 0 : remaining;
}

function scheduleNote(availability) {
  if (availability.label === 'Closed') return 'This test is currently closed by the administrator.';
  return null;
}

export default function FreeTestsShowcase({ compact = false, showIndexLink = true, variant = 'home' }) {
  const isHub = variant === 'hub';
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load(showSpinner) {
      if (showSpinner) setLoading(true);
      standaloneTestsApi
        .freeCatalog()
        .then((res) => {
          if (!cancelled) {
            setItems(res?.data?.items || []);
            setError('');
          }
        })
        .catch(() => {
          if (!cancelled) setError('Free tests are unavailable right now. Please try again later.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load(true);

    function onForeground() {
      if (document.visibilityState === 'visible') load(false);
    }

    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
    };
  }, []);

  if (!loading && !error && items.length === 0 && compact) {
    return null;
  }

  const shown = compact ? items.slice(0, 6) : items;

  return (
    <TestsCatalogSection
      id="free-tests"
      eyebrow="Free Tests"
      title="Practice without purchasing a course."
      titleId="free-test-series-heading"
      lead="Timed standalone tests. Sign in is required to start. Availability follows the published schedule and seat limit."
      viewAllTo={showIndexLink ? '/paid-tests#free-tests' : undefined}
      viewAllLabel={showIndexLink ? 'All free tests' : undefined}
    >
      {error ? <p className="tests-catalog__error">{error}</p> : null}

      {loading ? (
        <ul className="tests-catalog__grid">
          {[0, 1, 2].map((i) => (
            <li key={i} className="tests-catalog__item">
              <HomeTestCardSkeleton />
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && shown.length === 0 ? (
        <TestsEmptyState
          title="No free tests published yet"
          body="No free standalone tests are live right now. Course practice tests remain in your student portal after you enroll."
          actionTo={isHub ? '/courses' : undefined}
          actionLabel={isHub ? 'Browse courses' : undefined}
        />
      ) : null}

      {!loading && shown.length > 0 ? (
        <ul className="tests-catalog__grid">
          {shown.map((test) => {
            const seats = test.seatsUnlimited
              ? null
              : formatSeatRemaining(test.seatsRemaining, test.seatCapacity);
            const availability = catalogAvailability(
              { ...test, seatsFull: Boolean(seats?.isFull) },
              { kind: 'free' }
            );
            const action = resolveCatalogCardAction(test, availability, { kind: 'free' });
            const to = action.to || `/free-test/${encodeURIComponent(test.slug)}`;
            return (
              <li key={test.slug} className="tests-catalog__item">
                <HomeTestCard
                  to={to}
                  title={test.title}
                  subject={test.subject}
                  questionCount={test.questionCount}
                  durationMinutes={test.durationMinutes}
                  accessLabel="Free"
                  accessTone="free"
                  availabilityLabel={action.availabilityLabel}
                  availabilityTone={action.availabilityTone}
                  seatsLabel={seats?.label}
                  seatsValue={seatValue(test)}
                  scheduleStarts={formatStandaloneDateTime(test.startDate)}
                  scheduleEnds={formatStandaloneDateTime(test.endDate)}
                  scheduleNote={scheduleNote(availability)}
                  ctaLabel={action.ctaLabel}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </TestsCatalogSection>
  );
}
