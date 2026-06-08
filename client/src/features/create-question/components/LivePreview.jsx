import { truncatePreviewText } from '../utils/previewText.js';
import { resolveImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';

/**
 * Live preview — structure only; plain text rendering.
 * Preview rendering must never execute raw HTML.
 */
export default function LivePreview({
  metadata,
  questionPreviewText,
  questionImage,
  options,
  explanationPreviewText,
}) {
  const correctOption = options.find((opt) => opt.isCorrect) ?? null;
  const imagePreviewSrc = resolveImagePreviewSrc(questionImage?.url ?? '');

  return (
    <section className="admin-card cq-preview" aria-labelledby="cq-preview-heading">
      <h2 id="cq-preview-heading" className="heading-4">
        Live preview
      </h2>
      <p className="admin-field__hint cq-section__hint">
        Plain-text mirror only — no HTML execution.
      </p>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Metadata</h3>
        <dl className="cq-preview__meta">
          <div>
            <dt>Course</dt>
            <dd>{metadata.courseId || '—'}</dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{metadata.subjectId || '—'}</dd>
          </div>
          <div>
            <dt>Topic</dt>
            <dd>{metadata.topic || '—'}</dd>
          </div>
          <div>
            <dt>Difficulty</dt>
            <dd>{metadata.difficulty || '—'}</dd>
          </div>
          <div>
            <dt>Marks</dt>
            <dd>{metadata.marks}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{metadata.questionType}</dd>
          </div>
        </dl>
      </div>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Question</h3>
        <p className="cq-preview__text">
          {questionPreviewText ? (
            questionPreviewText
          ) : (
            <span className="cq-preview__empty">No question text yet</span>
          )}
        </p>
      </div>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Question image</h3>
        {imagePreviewSrc ? (
          <img
            src={imagePreviewSrc}
            alt="Question preview"
            className="admin-question-image-preview__img"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <p className="cq-preview__text">
            <span className="cq-preview__empty">No image</span>
          </p>
        )}
      </div>

      <div className="cq-preview__block">
        <h3 className="cq-preview__label">Options</h3>
        <ol className="cq-preview__options">
          {options.map((option) => (
            <li
              key={option.key}
              className={option.isCorrect ? 'cq-preview__option cq-preview__option--correct' : 'cq-preview__option'}
            >
              <span className="cq-preview__option-label">{option.label}.</span>
              <span>{truncatePreviewText(option.text, 120) || '—'}</span>
              {option.imageUrl ? (
                <span className="admin-field__hint"> · image</span>
              ) : null}
              {option.isCorrect ? (
                <span className="cq-preview__badge" aria-label="Marked correct">
                  ✓
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        {correctOption ? (
          <p className="admin-field__hint">
            Correct: {correctOption.label}
          </p>
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
