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

function formatPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'Paid';
  return `Rs. ${n.toLocaleString('en-PK')}`;
}

function seatValue(test) {
  const remaining = Number(test.seatsRemaining);
  const capacity = Number(test.seatCapacity);
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  if (!Number.isFinite(remaining)) return null;
  return remaining < 0 ? 0 : remaining;
}

export default function PaidTestsShowcase({ compact = false, showIndexLink = true, variant = 'home' }) {
  const isHub = variant === 'hub';
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load(showSpinner) {
      if (showSpinner) setLoading(true);
      standaloneTestsApi
        .catalog()
        .then((res) => {
          if (!cancelled) {
            setItems(res?.data?.items || []);
            setError('');
          }
        })
        .catch(() => {
          if (!cancelled) setError('Paid tests are unavailable right now. Please try again later.');
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
      id="paid-tests"
      alt
      eyebrow="Paid Tests"
      title="Independent paid examinations."
      titleId="paid-tests-heading"
      lead="Register on your own. Submit payment proof, then wait for seat confirmation. A confirmed seat does not open the exam until MRB Classes opens it."
      viewAllTo={showIndexLink ? '/paid-tests#paid-tests' : undefined}
      viewAllLabel={showIndexLink ? 'All paid tests' : undefined}
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
          title="No paid tests open"
          body="No paid standalone tests are open for registration right now. Check back later."
          actionTo={isHub ? '/courses' : undefined}
          actionLabel={isHub ? 'Browse courses' : undefined}
        />
      ) : null}

      {!loading && shown.length > 0 ? (
        <ul className="tests-catalog__grid">
          {shown.map((test) => {
            const seats = formatSeatRemaining(test.seatsRemaining, test.seatCapacity);
            const availability = catalogAvailability(
              { ...test, seatsFull: Boolean(seats.isFull) },
              { kind: 'paid' }
            );
            const action = resolveCatalogCardAction(test, availability, { kind: 'paid' });
            return (
              <li key={test.slug} className="tests-catalog__item">
                <HomeTestCard
                  to={action.to}
                  title={test.title}
                  subject={test.subject}
                  questionCount={test.questionCount}
                  durationMinutes={test.durationMinutes}
                  accessLabel={formatPkr(test.pricePkr)}
                  accessTone="paid"
                  availabilityLabel={action.availabilityLabel}
                  availabilityTone={action.availabilityTone}
                  seatsLabel={seats.label}
                  seatsValue={seatValue(test)}
                  scheduleStarts={formatStandaloneDateTime(test.startDate)}
                  scheduleEnds={formatStandaloneDateTime(test.endDate)}
                  scheduleNote={
                    availability.label === 'Closed'
                      ? 'This test is currently closed by the administrator.'
                      : null
                  }
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
