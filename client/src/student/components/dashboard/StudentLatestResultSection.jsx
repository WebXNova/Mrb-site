import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAnimatedStat } from '../../hooks/useAnimatedStat';
import { useInView } from '../../hooks/useInView';
import StudentIcon from '../icons/StudentIcons';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StudentLatestResultSection({ result }) {
  const [ref, inView] = useInView({ threshold: 0.25 });
  const score = result?.resultAvailable !== false ? Number(result?.score ?? 0) : 0;
  const maxScore = Number(result?.maxScore ?? 10) || 10;
  const ratio = maxScore > 0 ? Math.min(1, score / maxScore) : 0;
  const percentage = result?.percentage ?? Math.round(ratio * 100);
  const { value: displayScore } = useAnimatedStat(score, { enabled: inView && Boolean(result) });
  const { value: displayPct } = useAnimatedStat(percentage, { enabled: inView && Boolean(result) });
  const dashOffset = CIRCUMFERENCE * (1 - ratio);
  const [ringDrawn, setRingDrawn] = useState(false);

  useEffect(() => {
    if (!inView || !result) {
      setRingDrawn(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setRingDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [inView, result, score, maxScore]);

  return (
    <section
      ref={ref}
      className={`sp-result-section sp-card sp-card--highlight sp-animate-in sp-animate-in--8${result ? '' : ' sp-result-section--empty'}`}
      aria-labelledby="sp-result-title"
    >
      <header className="sp-result-section__header">
        <div>
          <p className="sp-label">Latest result</p>
          <h2 id="sp-result-title" className="sp-result-section__title">
            Recent performance
          </h2>
        </div>
        <StudentIcon name="award" size={28} className="sp-icon--gold" />
      </header>

      {result ? (
        <div className="sp-result-section__body">
          <div className="sp-result-ring">
            <svg className="sp-result-ring__svg" viewBox="0 0 140 140" aria-hidden>
              <circle className="sp-result-ring__bg" cx="70" cy="70" r={RADIUS} fill="none" strokeWidth="10" />
              <circle
                className="sp-result-ring__fill"
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                strokeWidth="10"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={ringDrawn ? dashOffset : CIRCUMFERENCE}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
              />
            </svg>
            <div className="sp-result-ring__label">
              <span className="sp-result-ring__score">
                {displayScore}/{maxScore}
              </span>
              <span className="sp-body">{displayPct}%</span>
            </div>
          </div>

          <dl className="sp-result-section__details">
            <div>
              <dt>Test</dt>
              <dd>{result.testTitle || 'Practice test'}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{result.subject || 'General'}</dd>
            </div>
            <div>
              <dt>Rank</dt>
              <dd>{result.rank ? `#${result.rank}` : '—'}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDate(result.submittedAt || result.createdAt)}</dd>
            </div>
          </dl>

          {result.resultAvailable !== false ? (
            <Link
              className="sp-btn sp-btn--primary sp-btn--full"
              to={`/dashboard/tests/${result.testId || 'test'}/results/${result.attemptId}`}
            >
              View detailed result
            </Link>
          ) : (
            <p className="sp-body sp-text-center">Results not released yet</p>
          )}
        </div>
      ) : (
        <p className="sp-body">No attempts yet. Take your first test to see results here.</p>
      )}
    </section>
  );
}
