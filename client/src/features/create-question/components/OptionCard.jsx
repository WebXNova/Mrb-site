import OptionImageInputComponent from './OptionImageInputComponent.jsx';

/**
 * Single MCQ option card (A–D).
 * Image changes are scoped to this option key only.
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
  onClearImageError,
  disabled = false,
}) {
  return (
    <article className="cq-option-card" aria-labelledby={`cq-option-${optionKey}-title`}>
      <header className="cq-option-card__header">
        <h3 id={`cq-option-${optionKey}-title`} className="cq-option-card__label">
          Option {optionKey}
        </h3>
        <label className="cq-option-card__correct">
          <input
            type="radio"
            name="cq-mcq-correct-option"
            checked={isCorrect}
            onChange={() => onSetCorrect(optionKey)}
            disabled={disabled}
          />
          <span>Correct answer</span>
        </label>
      </header>

      <div className="admin-field">
        <label htmlFor={`cq-option-${optionKey}-text`}>Option text</label>
        <input
          id={`cq-option-${optionKey}-text`}
          type="text"
          className="cq-option-card__text-input"
          value={option.text}
          onChange={(e) => onTextChange(optionKey, e.target.value)}
          disabled={disabled}
          placeholder={`Enter option ${optionKey}…`}
          aria-invalid={Boolean(textError)}
        />
        {textError ? (
          <div className="admin-field__error" role="alert">
            {textError}
          </div>
        ) : null}
      </div>

      <OptionImageInputComponent
        optionKey={optionKey}
        imageUrl={option.image_url}
        error={imageError}
        onImageCommitted={(url) => onImageCommit(optionKey, url)}
        onImageRemoved={() => onImageCommit(optionKey, '')}
        onClearError={() => onClearImageError?.(optionKey)}
        disabled={disabled}
      />
    </article>
  );
}
