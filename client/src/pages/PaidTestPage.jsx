import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import { markPaidStandaloneSession, standaloneTestsApi } from '../api/standaloneTestsApi';
import { getStudentToken } from '../auth/session';
import { setAttemptSession } from '../features/test-taking/utils/attemptSession';
import { getTestAccessErrorMessage } from '../features/test-instructions/utils/testAccessErrors';
import { getUserFacingErrorMessage } from '../utils/errorHandler';
import {
  formatDurationMinutes,
  formatQuestionCount,
  formatScheduleRange,
  formatSeatRemaining,
} from '../utils/testSeatCopy';
import { formatStandaloneDateTime } from '../utils/testCatalogAvailability';
import { usePageSeo } from '../seo/SeoContext';
import { SITE_ORIGIN } from '../seo/seoConfig';
import {
  IconArrowLeft,
  IconClock,
  IconListCheck,
  IconUsers,
} from '../components/public-tests/testsUiIcons.jsx';
import './paid-test-page.css';

function formatPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `Rs. ${n.toLocaleString('en-PK')}`;
}

function statusChips({ detail, registration }) {
  const chips = [];
  const seats = formatSeatRemaining(detail?.seatsRemaining, detail?.seatCapacity);
  if (seats.isFull) chips.push({ key: 'full', label: 'Full' });
  const listingStatus = String(detail?.listingStatus || '');
  if (listingStatus === 'upcoming') chips.push({ key: 'upcoming', label: 'Upcoming' });
  else if (listingStatus === 'live') chips.push({ key: 'open', label: 'Open' });
  else if (listingStatus === 'expired') chips.push({ key: 'closed', label: 'Expired' });
  else if (listingStatus === 'closed' || detail?.examOpen === false) chips.push({ key: 'closed', label: 'Closed' });
  else if (detail?.examOpen) chips.push({ key: 'open', label: 'Open' });
  else chips.push({ key: 'closed', label: 'Closed' });

  const order = registration?.orderStatus;
  if (order === 'pending') chips.push({ key: 'pending', label: 'Pending' });
  if (order === 'under_review') chips.push({ key: 'under_review', label: 'Under review' });
  if (order === 'approved') chips.push({ key: 'approved', label: 'Approved' });
  if (order === 'rejected') chips.push({ key: 'rejected', label: 'Rejected' });
  if (registration?.seatConfirmed) chips.push({ key: 'seat', label: 'Seat confirmed' });
  return chips;
}

export default function PaidTestPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const startInFlightRef = useRef(false);
  const loggedIn = Boolean(getStudentToken());

  usePageSeo(
    detail
      ? {
          title: `${detail.title} | MRB Classes`,
          description: detail.description
            ? String(detail.description).slice(0, 155)
            : `Register for ${detail.title} at MRB Classes. Payment is reviewed before a seat is confirmed.`,
          structuredData: {
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: detail.title,
            description: detail.description || undefined,
            startDate: detail.startDate || undefined,
            endDate: detail.endDate || undefined,
            eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
            eventStatus: detail.examOpen
              ? 'https://schema.org/EventScheduled'
              : 'https://schema.org/EventScheduled',
            organizer: { '@type': 'Organization', name: 'MRB Classes', url: SITE_ORIGIN },
            offers: {
              '@type': 'Offer',
              price: Number(detail.pricePkr) || 0,
              priceCurrency: 'PKR',
              availability:
                Number(detail.seatsRemaining) > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/SoldOut',
              url: `${SITE_ORIGIN}/paid-tests/${encodeURIComponent(slug || '')}`,
            },
          },
        }
      : {
          title: 'Paid Test | MRB Classes',
          description: 'Register for a paid standalone test at MRB Classes.',
        }
  );

  useEffect(() => {
    let cancelled = false;
    standaloneTestsApi
      .publicDetail(slug)
      .then((res) => {
        if (!cancelled) setDetail(res?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(getUserFacingErrorMessage(err, 'This test is not available.'));
      });
    if (getStudentToken()) {
      standaloneTestsApi
        .myRegistration(slug)
        .then((res) => {
          if (!cancelled) setRegistration(res?.data || null);
        })
        .catch(() => {
          if (!cancelled) setRegistration(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const seats = useMemo(
    () => formatSeatRemaining(detail?.seatsRemaining, detail?.seatCapacity),
    [detail]
  );
  const chips = useMemo(() => statusChips({ detail, registration }), [detail, registration]);
  const canStart = Boolean(registration?.canStart);
  const hasActiveAttempt = Boolean(registration?.hasActiveAttempt);

  async function startExam() {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setStarting(true);
    setError('');
    try {
      markPaidStandaloneSession(slug);
      const result = await standaloneTestsApi.verifyCode(slug, {});
      const attemptId = result?.data?.attemptId;
      if (!attemptId) {
        throw new Error('Could not start the test. Please try again.');
      }
      setAttemptSession(slug, {
        attemptId,
        expiresAt: result?.data?.expiresAt ?? null,
        accessKind: 'paid_standalone',
      });
      navigate(`/tests/${encodeURIComponent(slug)}/start`);
    } catch (err) {
      setError(getTestAccessErrorMessage(err, 'You cannot start this test yet.'));
    } finally {
      startInFlightRef.current = false;
      setStarting(false);
    }
  }

  const payHref =
    registration?.orderId != null
      ? `/paid-tests/${encodeURIComponent(slug)}/pay?order_id=${encodeURIComponent(registration.orderId)}`
      : null;

  return (
    <PageLayout>
      <div className="paid-test-shell">
        <div className="paid-test-page">
        <Link className="paid-test-page__back" to="/paid-tests">
          <IconArrowLeft size={16} />
          Back to tests
        </Link>

        {error ? (
          <p className="paid-test-page__error" role="alert">
            {error}
          </p>
        ) : null}

        {!detail && !error ? <div className="paid-test-skeleton" aria-hidden="true" /> : null}

        {detail ? (
          <>
            <p className="paid-test-page__eyebrow">Paid standalone test</p>
            <h1 className="paid-test-page__title">{detail.title}</h1>
            {detail.subject ? <p className="paid-test-page__lead">{detail.subject}</p> : null}
            {detail.description ? <p className="paid-test-page__lead">{detail.description}</p> : null}

            <div className="paid-test-status" aria-label="Registration status">
              {chips.map((chip) => (
                <span key={chip.key} className={`paid-test-status__chip paid-test-status__chip--${chip.key}`}>
                  <span className="paid-test-status__dot" aria-hidden="true" />
                  {chip.label}
                </span>
              ))}
            </div>

            <dl className="paid-test-page__meta">
              <div className="paid-test-page__meta-item">
                <dt>Price</dt>
                <dd>{formatPkr(detail.pricePkr)}</dd>
              </div>
              <div className="paid-test-page__meta-item">
                <dt>
                  <IconClock size={14} /> Duration
                </dt>
                <dd>{formatDurationMinutes(detail.durationMinutes) || '—'}</dd>
              </div>
              <div className="paid-test-page__meta-item">
                <dt>
                  <IconListCheck size={14} /> Questions
                </dt>
                <dd>{formatQuestionCount(detail.questionCount) || '—'}</dd>
              </div>
              <div className="paid-test-page__meta-item">
                <dt>
                  <IconUsers size={14} /> Seats
                </dt>
                <dd>{seats.label}</dd>
              </div>
            </dl>

            {formatStandaloneDateTime(detail.startDate) || formatStandaloneDateTime(detail.endDate) ? (
              <p className="paid-test-page__callout">
                {formatStandaloneDateTime(detail.startDate) ? (
                  <>
                    Starts: {formatStandaloneDateTime(detail.startDate)}
                    {formatStandaloneDateTime(detail.endDate) ? <br /> : null}
                  </>
                ) : null}
                {formatStandaloneDateTime(detail.endDate) ? <>Ends: {formatStandaloneDateTime(detail.endDate)}</> : null}
              </p>
            ) : formatScheduleRange(detail.startDate, detail.endDate) ? (
              <p className="paid-test-page__callout">
                Schedule: {formatScheduleRange(detail.startDate, detail.endDate)}
              </p>
            ) : null}

            <p className="paid-test-page__callout paid-test-page__callout--warn">
              Submitting payment does not guarantee a seat or exam access. An administrator must
              approve your proof first. The exam stays closed until MRB Classes opens it.
            </p>

            {registration?.orderStatus === 'under_review' ? (
              <p className="paid-test-page__callout" role="status">
                Your payment proof is under review. You will be able to start only after approval and
                when the test is open.
              </p>
            ) : null}

            {registration?.orderStatus === 'pending' && payHref ? (
              <p className="paid-test-page__callout" role="status">
                Your registration is saved. Continue to payment instructions to submit your transfer
                proof.
              </p>
            ) : null}

            {registration?.orderStatus === 'rejected' ? (
              <p className="paid-test-page__callout paid-test-page__callout--warn" role="status">
                This payment was not approved. You can submit a new proof from the payment page if
                registration is still open.
              </p>
            ) : null}

            {registration?.seatConfirmed && !detail.examOpen ? (
              <p className="paid-test-page__callout" role="status">
                Your seat is confirmed. The exam room is still closed. Check this page again when the
                administrator opens the test.
              </p>
            ) : null}

            {registration?.seatConfirmed &&
            detail.examOpen &&
            registration?.availability?.notYetAvailable ? (
              <p className="paid-test-page__callout" role="status">
                Your seat is confirmed and the exam is open, but it has not started yet
                {registration.availability.startDate
                  ? ` (starts ${formatStandaloneDateTime(registration.availability.startDate)})`
                  : ''}
                .
              </p>
            ) : null}

            {registration?.seatConfirmed &&
            detail.examOpen &&
            registration?.availability?.noLongerAvailable &&
            !hasActiveAttempt ? (
              <p className="paid-test-page__callout paid-test-page__callout--warn" role="status">
                The availability window for this test has ended
                {registration.availability.endDate
                  ? ` (${formatStandaloneDateTime(registration.availability.endDate)})`
                  : ''}
                . New attempts cannot be started.
              </p>
            ) : null}

            {detail.listingStatus === 'expired' && !hasActiveAttempt ? (
              <p className="paid-test-page__callout paid-test-page__callout--warn" role="status">
                This test is no longer available for new attempts. Completed results remain in My Results.
              </p>
            ) : null}

            {hasActiveAttempt ? (
              <p className="paid-test-page__callout" role="status">
                Your test session was saved. You can continue your attempt.
              </p>
            ) : null}

            <div className="paid-test-page__actions">
              {canStart ? (
                <Button type="button" onClick={startExam} disabled={starting}>
                  {starting ? 'Starting…' : hasActiveAttempt ? 'Continue test' : 'Start test'}
                </Button>
              ) : null}

              {!canStart && loggedIn && payHref && registration?.orderStatus !== 'approved' ? (
                <Button as={Link} to={payHref}>
                  Continue to payment
                </Button>
              ) : null}

              {!canStart && loggedIn && !registration?.orderId && !seats.isFull && detail.listingStatus !== 'expired' ? (
                <Button as={Link} to={`/paid-tests/${encodeURIComponent(slug)}/register`}>
                  Register for test
                </Button>
              ) : null}

              {!loggedIn ? (
                <Button
                  as={Link}
                  to={`/login?redirect=${encodeURIComponent(`/paid-tests/${slug}`)}`}
                >
                  Sign in to register
                </Button>
              ) : null}

              {seats.isFull && !registration?.seatConfirmed ? (
                <p className="paid-test-page__lead" role="status">
                  Registration is closed because no seats remain.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
