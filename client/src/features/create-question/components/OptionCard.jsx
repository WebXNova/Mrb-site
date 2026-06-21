import { useEditorRibbon } from '../ribbon/EditorRibbonProvider.jsx';
import AddPhotoIcon from '../ribbon/AddPhotoIcon.jsx';
import { resolveOptionImagePreviewSrc } from '../utils/image/imagePreviewUrl.js';

/**
 * Compact MCQ option row — images via ribbon Insert, not per-option upload forms.
 */
export default function OptionCard({
  optionKey,
  option,
  isCorrect,
  textError = '',
  imageError = '',
  onTextChange,
  onImageCommit,
  onSetCorrect,
  disabled = false,
}) {
  const { setOptionFocus } = useEditorRibbon();
  const previewSrc = resolveOptionImagePreviewSrc(option.image_url);
  const hasImage = Boolean(previewSrc);

  return (
    <article
      className={`cq-option-row${isCorrect ? ' cq-option-row--correct' : ''}`}
      aria-labelledby={`cq-option-${optionKey}-title`}
    >
      <div className="cq-option-row__marker-col">
        <span id={`cq-option-${optionKey}-title`} className="cq-option-row__letter" aria-hidden="true">
          {optionKey}
        </span>
        <label className="cq-option-row__correct">
          <input
            type="radio"
            name="cq-mcq-correct-option"
            checked={isCorrect}
            onChange={() => onSetCorrect(optionKey)}
            disabled={disabled}
            aria-label={`Mark option ${optionKey} as correct`}
          />
        </label>
      </div>

      <div className="cq-option-row__main">
        <input
          id={`cq-option-${optionKey}-text`}
          type="text"
          className="cq-option-row__text"
          value={option.text}
          onChange={(e) => onTextChange(optionKey, e.target.value)}
          onFocus={() => setOptionFocus(optionKey)}
          disabled={disabled}
          placeholder={`Enter option ${optionKey}…`}
          aria-invalid={Boolean(textError)}
          aria-label={`Option ${optionKey} text`}
        />
        {textError ? (
          <div className="admin-field__error cq-option-row__error" role="alert">
            {textError}
          </div>
        ) : null}
        {imageError ? (
          <div className="admin-field__error cq-option-row__error" role="alert">
            {imageError}
          </div>
        ) : null}
      </div>

      <div className="cq-option-row__media">
        {hasImage ? (
          <>
            <img
              src={previewSrc}
              alt={`Option ${optionKey} image`}
              className="cq-option-row__thumb"
              referrerPolicy="no-referrer"
              loading="lazy"
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm cq-option-row__remove-img"
              onClick={() => onImageCommit(optionKey, '')}
              disabled={disabled}
              aria-label={`Remove image from option ${optionKey}`}
            >
              ×
            </button>
          </>
        ) : (
          <span
            className="cq-option-row__img-hint"
            title="Focus this option, then use Insert → Image in the toolbar"
            aria-hidden="true"
          >
            <AddPhotoIcon className="cq-option-row__img-icon" />
          </span>
        )}
      </div>
    </article>
  );
}
