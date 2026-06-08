import { memo, useCallback } from 'react';

function QuestionOptions({ questionId, options, selectedOptionId, onSelectOption, disabled }) {
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

  return (
    <fieldset className="tt-options" disabled={disabled}>
      <legend className="visually-hidden">Select one answer</legend>
      {options.map((option, index) => {
        const optionId = String(option.id);
        const isSelected = selectedOptionId === optionId;
        const letter = String.fromCharCode(65 + index);

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
            <span className="tt-option__text">{option.text}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

export default memo(QuestionOptions);
