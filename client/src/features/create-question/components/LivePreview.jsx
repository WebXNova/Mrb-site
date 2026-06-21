import { truncatePreviewText } from '../utils/previewText.js';
import SafeRichPreview from './SafeRichPreview.jsx';

/**
 * Live student preview — sanitized content only, no raw HTML execution.
 */
export default function LivePreview({
  questionSanitizedHtml,
  options,
  explanationPreviewText,
}) {
  const correctOption = options.find((opt) => opt.isCorrect) ?? null;

  return (
    <section className="cq-preview qaw-live-preview" aria-labelledby="cq-preview-heading">
      <div className="qaw-live-preview__header">
        <h2 id="cq-preview-heading" className="heading-4">
          Student preview
        </h2>
        <span className="qaw-live-preview__badge">Read-only</span>
      </div>
      <p className="admin-field__hint cq-section__hint">
        Mirrors what students see — plain text, validated images, and tables only.
      </p>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Question</h3>
        <SafeRichPreview sanitizedHtml={questionSanitizedHtml} />
      </div>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Options</h3>
        <ol className="cq-preview__options">
          {options.map((option) => (
            <li
              key={option.key}
              className={
                option.isCorrect
                  ? 'cq-preview__option cq-preview__option--correct'
                  : 'cq-preview__option'
              }
            >
              <span className="cq-preview__option-label">{option.label}.</span>
              <span>{truncatePreviewText(option.text, 120) || '—'}</span>
              {option.imageUrl ? <span className="admin-field__hint"> · image</span> : null}
              {option.isCorrect ? (
                <span className="cq-preview__badge" aria-label="Marked correct">
                  ✓
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        {correctOption ? (
          <p className="admin-field__hint">Correct: {correctOption.label}</p>
        ) : null}
      </div>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Explanation</h3>
        <p className="cq-preview__text">
          {explanationPreviewText ? (
            explanationPreviewText
          ) : (
            <span className="cq-preview__empty">No explanation</span>
          )}
        </p>
      </div>
    </section>
  );
}
