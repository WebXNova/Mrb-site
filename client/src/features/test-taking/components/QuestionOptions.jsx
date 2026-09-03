import { memo } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';
import { stripExamContentLabels } from '../utils/examContentDisplay.js';

function QuestionOptions({
  questionId,
  options,
  selectedOptionId,
  onSelectOption,
  disabled,
}) {
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
        const letter = String.fromCharCode(65 + index);
        const optionHtml = stripExamContentLabels(option.text ?? '');
        const optionLooksLikeHtml = /<[a-z][\s\S]*>/i.test(optionHtml);
        const selected = selectedOptionId != null && String(selectedOptionId) === optionId;

        return (
          <label
            key={`${questionId}-${optionId}-${index}`}
            className={`tt-option ${selected ? 'tt-option--selected' : ''}`}
            htmlFor={`tt-option-${questionId}-${optionId}`}
          >
            <input
              id={`tt-option-${questionId}-${optionId}`}
              type="radio"
              name={`question-${questionId}`}
              value={optionId}
              checked={selected}
              onChange={() => {
                if (!disabled) onSelectOption(questionId, optionId);
              }}
              disabled={disabled}
            />
            <span className="tt-option__marker" aria-hidden="true">
              {letter}
            </span>
            <span className="tt-option__text">
              {optionLooksLikeHtml ? (
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
