import { OPTION_KEYS } from '../utils/options/optionKeys.js';
import OptionCard from './OptionCard.jsx';

/**
 * MCQ Options Builder — fixed A–D cards.
 *
 * Only one correct option is allowed by design.
 * Option state is not trusted until backend validation.
 * Images must be validated before storage.
 *
 * Data flow:
 *   User Input → reducer → (future sanitize) → Preview → API
 */
export default function OptionsBuilder({
  options,
  errors = {},
  onOptionTextChange,
  onOptionImageChange,
  onCorrectOptionChange,
  onClearOptionImageError,
  disabled = false,
}) {
  return (
    <section className="admin-card cq-section" aria-labelledby="cq-options-heading">
      <h2 id="cq-options-heading" className="heading-4">
        Options
      </h2>
      <p className="admin-field__hint cq-section__hint">
        Single-choice MCQ — exactly one correct answer (A–D).
      </p>

      <div className="cq-option-cards">
        {OPTION_KEYS.map((key) => (
          <OptionCard
            key={key}
            optionKey={key}
            option={options[key]}
            isCorrect={Boolean(options[key]?.is_correct)}
            textError={errors[`option_${key}_text`] || ''}
            imageError={errors[`option_${key}_image`] || ''}
            onTextChange={onOptionTextChange}
            onImageCommit={onOptionImageChange}
            onSetCorrect={onCorrectOptionChange}
            onClearImageError={onClearOptionImageError}
            disabled={disabled}
          />
        ))}
      </div>

      {errors.options ? (
        <div className="admin-field__error" role="alert">
          {errors.options}
        </div>
      ) : null}
    </section>
  );
}
