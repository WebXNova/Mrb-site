import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { markStandaloneSession } from '../../api/standaloneTestsApi';
import { MY_RESULTS_PATH } from '../../utils/myResultsPaths';

function formatAttemptedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  const minutes = Math.floor(n / 60);
  const rest = n % 60;
  if (minutes <= 0) return `${rest}s`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest}s`;
}

function accessLabel(accessType) {
  return accessType === 'paid_standalone' ? 'Paid' : 'Free';
}

function resultHref(item) {
  if (!item.slug) return MY_RESULTS_PATH;
  const kind = item.accessType === 'paid_standalone' ? 'paid_standalone' : 'free_standalone';
  return `/tests/${encodeURIComponent(item.slug)}/result?attemptId=${encodeURIComponent(item.attemptId)}&kind=${kind}`;
}

function continueHref(item) {
  if (!item.slug) return '/paid-tests';
  if (item.accessType === 'paid_standalone') {
    return `/paid-tests/${encodeURIComponent(item.slug)}`;
  }
  return `/free-test/${encodeURIComponent(item.slug)}`;
}

function dateLabel(item) {
  if (item.state === 'pending') return 'Submitted';
  if (item.state === 'in_progress') return 'Started';
  return 'Completed';
}

export default function MyTestRecordCard({ item }) {
  const attempted = formatAttemptedDate(item.attemptedAt);
  const timeTaken = formatDuration(item.timeTakenSeconds);
  const kind = item.accessType === 'paid_standalone' ? 'paid_standalone' : 'free_standalone';
  const statusLabel = item.statusLabel
    || (item.state === 'published'
      ? 'Result Published'
      : item.state === 'pending'
        ? 'Results Pending'
        : item.state === 'in_progress'
          ? 'In Progress'
          : 'Closed');
  const ctaLabel = item.ctaLabel
    || (item.state === 'published' ? 'View Details' : item.state === 'pending' ? 'View Status' : 'Continue Test');
  const showScore = item.state === 'published';

  function onOpenResult() {
    if (item.slug) markStandaloneSession(item.slug, kind);
  }

  return (
    <article className={`my-test-card my-test-card--${item.state}`}>
      <div className="my-test-card__top">
        <span className={`my-test-card__kind my-test-card__kind--${kind === 'paid_standalone' ? 'paid' : 'free'}`}>
          {accessLabel(item.accessType)}
        </span>
        <span className={`my-test-card__state my-test-card__state--${item.state}`}>
          {statusLabel}
        </span>
      </div>

      {item.subjectLabel ? <p className="my-test-card__subject">{item.subjectLabel}</p> : null}
      <h3 className="my-test-card__title">{item.testTitle}</h3>
      {attempted ? (
        <p className="my-test-card__date">
          {dateLabel(item)}: {attempted}
        </p>
      ) : null}

      {showScore ? (
        <dl className="my-test-card__stats">
          {item.score != null && item.maxScore != null ? (
            <div>
              <dt>Score</dt>
              <dd>
                {item.score} / {item.maxScore}
              </dd>
            </div>
          ) : null}
          {item.percentage != null ? (
            <div>
              <dt>Percentage</dt>
              <dd>{item.percentage}%</dd>
            </div>
          ) : null}
          {item.correctCount != null ? (
            <div>
              <dt>Correct</dt>
              <dd>{item.correctCount}</dd>
            </div>
          ) : null}
          {item.incorrectCount != null ? (
            <div>
              <dt>Incorrect</dt>
              <dd>{item.incorrectCount}</dd>
            </div>
          ) : null}
          {timeTaken ? (
            <div>
              <dt>Time taken</dt>
              <dd>{timeTaken}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {item.state === 'pending' ? (
        <p className="my-test-card__note">
          Your test has been submitted successfully. The result is not yet available.
        </p>
      ) : null}

      {item.state === 'in_progress' ? (
        <p className="my-test-card__note">This attempt is still in progress.</p>
      ) : null}

      {item.state === 'blocked' ? (
        <p className="my-test-card__note">Your attempt for this test has been closed.</p>
      ) : null}

      <div className="my-test-card__actions">
        {item.state === 'published' || item.state === 'pending' ? (
          <Button as={Link} to={resultHref(item)} variant="primary" size="sm" onClick={onOpenResult}>
            {ctaLabel}
          </Button>
        ) : null}
        {item.state === 'in_progress' ? (
          <Button as={Link} to={continueHref(item)} variant="primary" size="sm">
            Continue Test
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function MyTestRecordSkeleton() {
  return (
    <article className="my-test-card my-test-card--skeleton" aria-hidden="true">
      <div className="my-test-card__skel my-test-card__skel--badge" />
      <div className="my-test-card__skel my-test-card__skel--title" />
      <div className="my-test-card__skel my-test-card__skel--meta" />
    </article>
  );
}
