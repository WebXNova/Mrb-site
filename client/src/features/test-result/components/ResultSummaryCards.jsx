import {
  formatPercentageDisplay,
  formatScoreDisplay,
  formatTimeTaken,
} from '../utils/formatDisplay';
import ResultStatusBadge from './ResultStatusBadge';

function SummaryCard({ label, value, id, variant = '' }) {
  return (
    <article className={`tr-summary-card ${variant}`.trim()} aria-labelledby={id}>
      <p className="tr-summary-card__label" id={id}>
        {label}
      </p>
      <p className="tr-summary-card__value">{value}</p>
    </article>
  );
}

export default function ResultSummaryCards({ result }) {
  if (!result) return null;

  return (
    <section className="tr-summary" aria-labelledby="tr-summary-heading">
      <h2 id="tr-summary-heading" className="visually-hidden">
        Result summary
      </h2>

      <div className="tr-summary__hero">
        <ResultStatusBadge status={result.status} />
      </div>

      <div className="tr-summary-grid">
        <SummaryCard
          id="tr-summary-score"
          label="Score"
          value={formatScoreDisplay(result.score, result.maxScore)}
          variant="tr-summary-card--highlight"
        />
        <SummaryCard
          id="tr-summary-percentage"
          label="Percentage"
          value={formatPercentageDisplay(result.percentage)}
          variant="tr-summary-card--highlight"
        />
        <SummaryCard
          id="tr-summary-correct"
          label="Correct answers"
          value={result.correctAnswers ?? '—'}
          variant="tr-summary-card--correct"
        />
        <SummaryCard
          id="tr-summary-wrong"
          label="Wrong answers"
          value={result.wrongAnswers ?? '—'}
          variant="tr-summary-card--wrong"
        />
        <SummaryCard
          id="tr-summary-unanswered"
          label="Unanswered"
          value={result.unansweredAnswers ?? '—'}
          variant="tr-summary-card--unanswered"
        />
        <SummaryCard
          id="tr-summary-time"
          label="Time taken"
          value={formatTimeTaken(result.timeTakenSeconds)}
        />
      </div>
    </section>
  );
}
