import QuizRichField from './QuizRichField.jsx';

/**
 * @param {{
 *   choice: import('../types/quizBuilder.types.js').QuizChoice,
 *   index: number,
 *   questionId: string,
 *   onTextChange: (text: string) => void,
 *   onCorrectChange: () => void,
 *   onDelete: () => void,
 *   canDelete: boolean,
 *   disabled?: boolean,
 * }} props
 */
export default function AnswerOptionRow({
  choice,
  index,
  questionId,
  onTextChange,
  onCorrectChange,
  onDelete,
  canDelete,
  disabled = false,
}) {
  const editorId = `choice:${choice.id}`;

  return (
    <div className="qb-choice-row">
      <div className="qb-choice-row__correct">
        <input
          type="radio"
          id={`${editorId}-correct`}
          name={`qb-correct-${questionId}`}
          className="qb-choice-row__marker"
          checked={choice.isCorrect}
          onChange={onCorrectChange}
          disabled={disabled}
          aria-label={`Mark choice ${index + 1} as correct`}
        />
      </div>

      <div className="qb-choice-row__editor">
        <QuizRichField
          editorId={editorId}
          value={choice.text}
          onChange={onTextChange}
          placeholder={`Choice ${index + 1}`}
          ariaLabel={`Choice ${index + 1}`}
          disabled={disabled}
          compact
        />
      </div>

      {canDelete ? (
        <button
          type="button"
          className="qb-choice-row__delete"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Delete choice ${index + 1}`}
          title="Delete choice"
        >
          ×
        </button>
      ) : (
        <span className="qb-choice-row__delete-spacer" aria-hidden="true" />
      )}
    </div>
  );
}
