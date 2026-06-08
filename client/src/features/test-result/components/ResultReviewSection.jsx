import { memo } from 'react';
import DOMPurify from 'dompurify';

function statusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'correct':
      return 'Correct';
    case 'wrong':
      return 'Incorrect';
    case 'unanswered':
      return 'Unanswered';
    default:
      return status || '—';
  }
}

const ResultReviewItem = memo(function ResultReviewItem({ item, index }) {
  const statusClass = String(item.status || '').toLowerCase();

  return (
    <article
      className={`tr-review-item tr-review-item--${statusClass}`}
      aria-labelledby={`tr-review-q-${index}`}
    >
      <header className="tr-review-item__header">
        <span className="tr-review-item__number">Q{index + 1}</span>
        <span className={`tr-review-item__status tr-review-item__status--${statusClass}`}>
          {statusLabel(item.status)}
        </span>
      </header>

      <div
        id={`tr-review-q-${index}`}
        className="tr-review-item__question"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(item.questionHtml || ''),
        }}
      />

      <dl className="tr-review-item__answers">
        <div className="tr-review-item__row">
          <dt>Your answer</dt>
          <dd>{item.yourAnswer || '—'}</dd>
        </div>
        <div className="tr-review-item__row">
          <dt>Correct answer</dt>
          <dd>{item.correctAnswer || '—'}</dd>
        </div>
      </dl>

      {item.explanationHtml ? (
        <div className="tr-review-item__explanation">
          <h4 className="tr-review-item__explanation-title">Explanation</h4>
          <div
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(item.explanationHtml),
            }}
          />
        </div>
      ) : null}
    </article>
  );
});

export default function ResultReviewSection({ items }) {
  if (!items?.length) return null;

  return (
    <section className="tr-review" aria-labelledby="tr-review-heading">
      <h2 id="tr-review-heading" className="tr-section-title">
        Detailed review
      </h2>
      <p className="tr-review__intro">
        Review each question with your submitted answers and the official correct answers.
      </p>

      <ol className="tr-review__list">
        {items.map((item, index) => (
          <li key={`review-${index}`} className="tr-review__list-item">
            <ResultReviewItem item={item} index={index} />
          </li>
        ))}
      </ol>
    </section>
  );
}
