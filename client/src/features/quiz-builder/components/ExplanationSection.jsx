import QuizRichField from './QuizRichField.jsx';

/**
 * @param {{
 *   showExplanation: boolean,
 *   explanation: string,
 *   questionNumber: number,
 *   onToggle: (enabled: boolean) => void,
 *   onChange: (text: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function ExplanationSection({
  showExplanation,
  explanation,
  questionNumber,
  onToggle,
  onChange,
  disabled = false,
}) {
  const checkboxId = `qb-explanation-toggle-${questionNumber}`;

  return (
    <div className="qb-explanation">
      <label className="qb-explanation__toggle" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={showExplanation}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
        />
        <span>Add Explanation</span>
      </label>

      {showExplanation ? (
        <div className="qb-explanation__editor">
          <p className="qb-explanation__label">Explanation</p>
          <QuizRichField
            editorId="explanation"
            value={explanation}
            onChange={onChange}
            placeholder="Provide answer explanations, feedback, or solution details…"
            ariaLabel={`Explanation for question ${questionNumber}`}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}
