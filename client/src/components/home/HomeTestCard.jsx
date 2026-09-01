import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { IconClock, IconListCheck, IconUsers } from '../public-tests/testsUiIcons.jsx';
import './HomeTestCard.css';

function questionStat(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { value: String(n), label: n === 1 ? 'Question' : 'Questions', icon: <IconListCheck size={16} /> };
}

function durationStat(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { value: n === 1 ? '1 min' : `${n} min`, label: 'Duration', icon: <IconClock size={16} /> };
}

export default function HomeTestCard({
  to,
  title,
  subject,
  questionCount,
  durationMinutes,
  accessLabel = 'Free',
  accessTone = 'free',
  availabilityLabel,
  availabilityTone = 'open',
  seatsLabel,
  seatsValue,
  scheduleStarts,
  scheduleEnds,
  scheduleNote,
  ctaLabel = 'Start Test',
  ctaDisabled = false,
  style,
}) {
  const questions = questionStat(questionCount);
  const duration = durationStat(durationMinutes);
  const seats =
    seatsValue != null && String(seatsValue) !== ''
      ? { value: String(seatsValue), label: Number(seatsValue) === 1 ? 'Seat left' : 'Seats left', icon: <IconUsers size={16} /> }
      : null;
  const cardClass = `home-test-card home-test-card--${accessTone}${ctaDisabled || !to ? ' home-test-card--static' : ''}`;
  const showCta = Boolean(ctaLabel);

  return (
    <article className={cardClass} style={style}>
      <div className="home-test-card__body">
        <div className="home-test-card__badges">
          <span className={`home-test-card__access home-test-card__access--${accessTone}`}>{accessLabel}</span>
          {availabilityLabel ? (
            <span className={`home-test-card__avail home-test-card__avail--${availabilityTone}`}>
              {availabilityLabel}
            </span>
          ) : null}
        </div>
        {subject ? <p className="home-test-card__subject">{subject}</p> : null}
        <h3 className="home-test-card__title">{title}</h3>
        {scheduleStarts || scheduleEnds || scheduleNote ? (
          <dl className="home-test-card__schedule">
            {scheduleStarts ? (
              <div>
                <dt>Starts</dt>
                <dd>{scheduleStarts}</dd>
              </div>
            ) : null}
            {scheduleEnds ? (
              <div>
                <dt>Ends</dt>
                <dd>{scheduleEnds}</dd>
              </div>
            ) : null}
            {scheduleNote ? (
              <p className="home-test-card__schedule-note">{scheduleNote}</p>
            ) : null}
          </dl>
        ) : null}
        {questions || duration || seats ? (
          <ul className="home-test-card__stats">
            {questions ? (
              <li>
                {questions.icon}
                <strong>{questions.value}</strong>
                <span>{questions.label}</span>
              </li>
            ) : null}
            {duration ? (
              <li>
                {duration.icon}
                <strong>{duration.value}</strong>
                <span>{duration.label}</span>
              </li>
            ) : null}
            {seats ? (
              <li>
                {seats.icon}
                <strong>{seats.value}</strong>
                <span>{seats.label}</span>
              </li>
            ) : null}
          </ul>
        ) : seatsLabel ? (
          <p className="home-test-card__seats-note">{seatsLabel}</p>
        ) : null}
      </div>
      {showCta ? (
        <div className="home-test-card__footer">
          {ctaDisabled || !to ? (
            <Button type="button" variant="secondary" size="sm" disabled>
              {ctaLabel}
            </Button>
          ) : (
            <Button as={Link} to={to} variant="primary" size="sm" aria-label={`${ctaLabel}: ${title}`}>
              {ctaLabel}
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}

export function HomeTestCardSkeleton() {
  return (
    <article className="home-test-card home-test-card--skeleton" aria-hidden="true">
      <div className="home-test-card__body">
        <div className="home-test-card__skel home-test-card__skel--badges" />
        <div className="home-test-card__skel home-test-card__skel--title" />
        <div className="home-test-card__skel home-test-card__skel--meta" />
      </div>
    </article>
  );
}
