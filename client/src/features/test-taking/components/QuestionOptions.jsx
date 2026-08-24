import { memo, useCallback } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';

function QuestionOptions({
  questionId,
  options,
  selectedOptionId,
  onSelectOption,
  disabled,
  layoutMode = 'vertical',
}) {
  const handleKeyDown = useCallback(
    (event, optionId) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!disabled) onSelectOption(questionId, optionId);
      }
    },
    [disabled, onSelectOption, questionId]
  );

  if (!options?.length) {
    return (
      <p className="tt-options__empty" role="alert">
        No answer options are available for this question. Please contact your instructor.
      </p>
    );
  }

  const layoutClass =
    layoutMode === 'horizontal' ? 'tt-options tt-options--horizontal' : 'tt-options';

  return (
    <fieldset className={layoutClass} disabled={disabled}>
      <legend className="visually-hidden">Select one answer</legend>
      {options.map((option, index) => {
        const optionId = String(option.id);
        const isSelected = selectedOptionId === optionId;
        const letter = String.fromCharCode(65 + index);
        const optionHtml = option.text ?? '';

        return (
          <label
            key={optionId}
            className={`tt-option ${isSelected ? 'tt-option--selected' : ''}`}
          >
            <input
              type="radio"
              name={`question-${questionId}`}
              value={optionId}
              checked={isSelected}
              onChange={() => onSelectOption(questionId, optionId)}
              onKeyDown={(event) => handleKeyDown(event, optionId)}
              disabled={disabled}
            />
            <span className="tt-option__marker" aria-hidden="true">
              {letter}
            </span>
            <span className="tt-option__text">
              {optionHtml.includes('<') ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: sanitizeStudentRichHtml(optionHtml),
                  }}
                />
              ) : (
                optionHtml
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export default memo(QuestionOptions);
