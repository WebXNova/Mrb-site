import QuizRichField from './QuizRichField.jsx';

/**
 * Optional hint shown to students during the test (not after results).
 *
 * @param {{
 *   showTip: boolean,
 *   tip: string,
 *   questionNumber: number,
 *   onToggle: (enabled: boolean) => void,
 *   onChange: (text: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function TipSection({
  showTip,
  tip,
  questionNumber,
  onToggle,
  onChange,
  disabled = false,
}) {
  const checkboxId = `qb-tip-toggle-${questionNumber}`;

  return (
    <div className="qb-tip">
      <label className="qb-tip__toggle" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={showTip}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={disabled}
        />
        <span>Add Tip</span>
      </label>
      <p className="qb-tip__hint">
        Shown to the student while taking the test as a hint. Explanations appear after results are released.
      </p>

      {showTip ? (
        <div className="qb-tip__editor">
          <p className="qb-tip__label">Tip</p>
          <QuizRichField
            editorId="tip"
            value={tip}
            onChange={onChange}
            placeholder="Optional hint for students during the test…"
            ariaLabel={`Tip for question ${questionNumber}`}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}
