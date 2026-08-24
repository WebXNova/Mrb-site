import { memo } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';

function SectionDivider({
  section,
  showContinue = false,
  onContinue,
  disabled = false,
  inline = false,
}) {
  const label = section?.subjectLabel?.trim() || 'Section';

  return (
    <article
      className={`tt-section-divider ${inline ? 'tt-section-divider--inline' : ''}`}
      aria-labelledby="tt-section-divider-heading"
    >
      <p className="tt-section-divider__eyebrow">Section</p>
      <h2 className="tt-section-divider__heading" id="tt-section-divider-heading">
        {label}
      </h2>

      {section?.dividerContentHtml ? (
        <div
          className="tt-section-divider__content rich-text"
          dangerouslySetInnerHTML={{
            __html: sanitizeStudentRichHtml(section.dividerContentHtml),
          }}
        />
      ) : null}

      {showContinue ? (
        <div className="tt-section-divider__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onContinue}
            disabled={disabled}
          >
            Continue to questions
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default memo(SectionDivider);
