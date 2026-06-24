import { memo } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';

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

function getOptionClass(option, selectedOptionId, correctOptionId) {
  const isSelected = selectedOptionId != null && Number(option.id) === Number(selectedOptionId);
  const isCorrect = Boolean(option.isCorrect);
  if (isSelected && isCorrect) return 'tr-option--selected-correct';
  if (isSelected) return 'tr-option--selected-wrong';
  if (isCorrect) return 'tr-option--correct';
  return '';
}

function getOptionLabel(option, selectedOptionId, correctOptionId) {
  const isSelected = selectedOptionId != null && Number(option.id) === Number(selectedOptionId);
  const isCorrect = Boolean(option.isCorrect);
  if (isSelected && isCorrect) return 'Your answer (correct)';
  if (isSelected) return 'Your answer (incorrect)';
  if (isCorrect) return 'Correct answer';
  return '';
}

const ResultReviewItem = memo(function ResultReviewItem({ item, index }) {
  const statusClass = String(item.status || '').toLowerCase();
  const selectedOptionId = item.selectedOptionId;
  const correctOptionId = item.options?.find((o) => o.isCorrect)?.id ?? null;

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
          __html: sanitizeStudentRichHtml(item.questionHtml || ''),
        }}
      />

      {item.questionImageUrl && (
        <div className="tr-review-item__question-image">
          <img
            src={item.questionImageUrl}
            alt="Question image"
            className="tr-review-item__img"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      {item.options.length > 0 && (
        <ul className="tr-review-item__option-list">
          {item.options.map((option) => {
            const optClass = getOptionClass(option, selectedOptionId, correctOptionId);
            const optLabel = getOptionLabel(option, selectedOptionId, correctOptionId);
            return (
              <li
                key={option.id}
                className={`tr-review-item__option ${optClass}`}
                title={optLabel}
              >
                <span className="tr-review-item__option-key">{option.key}.</span>
                <span
                  className="tr-review-item__option-text"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeStudentRichHtml(option.text || ''),
                  }}
                />
                {option.imageUrl && (
                  <img
                    src={option.imageUrl}
                    alt=""
                    className="tr-review-item__option-img"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                {optLabel && (
                  <span className="tr-review-item__option-badge">{optLabel}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(!item.options || item.options.length === 0) && (
        <dl className="tr-review-item__answers">
          <div className="tr-review-item__row">
            <dt>Your answer</dt>
            <dd>{item.yourAnswer || (item.selectedOptionId != null ? 'Response submitted' : '—')}</dd>
          </div>
          <div className="tr-review-item__row">
            <dt>Correct answer</dt>
            <dd>{item.correctAnswer || '—'}</dd>
          </div>
        </dl>
      )}

      {(item.marks != null || item.marksAwarded != null) && (
        <div className="tr-review-item__marks">
          {item.marksAwarded != null && item.marks != null
            ? `Marks: ${item.marksAwarded} / ${item.marks}`
            : item.marks != null
              ? `Marks: ${item.marks}`
              : null}
        </div>
      )}

      {item.explanationHtml && (
        <div className="tr-review-item__explanation">
          <h4 className="tr-review-item__explanation-title">Explanation</h4>
          <div
            dangerouslySetInnerHTML={{
              __html: sanitizeStudentRichHtml(item.explanationHtml),
            }}
          />
        </div>
      )}
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
