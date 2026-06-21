import { memo } from 'react';

/**
 * Student MCQ options — disabled radios, plain text, validated option images.
 * Does not reveal which option is correct (matches live test UX).
 */
function StudentPreviewOptions({ options }) {
  if (!options.length) {
    return <p className="sp-empty">No answer options yet</p>;
  }

  return (
    <fieldset className="sp-options" disabled aria-label="Answer options preview">
      <legend className="sp-sr-only">Select one answer</legend>
      {options.map((option) => (
        <div key={option.key} className="sp-option">
          <span className="sp-option__marker" aria-hidden="true">
            {option.label}
          </span>
          <div className="sp-option__body">
            <p className="sp-option__text">{option.text || '—'}</p>
            {option.hasImage && option.imagePreviewSrc ? (
              <figure className="sp-option__figure">
                <img
                  src={option.imagePreviewSrc}
                  alt={`Option ${option.label} image`}
                  className="sp-option__img"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            ) : null}
          </div>
          <input
            type="radio"
            className="sp-sr-only"
            name="sp-preview-option"
            disabled
            readOnly
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      ))}
    </fieldset>
  );
}

export default memo(StudentPreviewOptions);
