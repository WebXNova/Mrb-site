import { QUIZ_MCQ_MAX_OPTIONS } from '../validation/quizMcqLimits.js';
import AnswerOptionRow from './AnswerOptionRow.jsx';

/**
 * @param {{
 *   question: import('../types/quizBuilder.types.js').QuizQuestion,
 *   actions: Record<string, Function>,
 *   disabled?: boolean,
 * }} props
 */
export default function AnswerOptionsList({ question, actions, disabled = false }) {
  const { id: questionId, choices } = question;

  return (
    <div className="qb-choices">
      <p className="qb-choices__hint">Select the single correct answer.</p>

      <div className="qb-choices__list" role="group" aria-label="Answer choices">
        {choices.map((choice, index) => (
          <AnswerOptionRow
            key={choice.id}
            choice={choice}
            index={index}
            questionId={questionId}
            onTextChange={(text) => actions.updateChoice(questionId, choice.id, { text })}
            onCorrectChange={() => actions.setSingleCorrect(questionId, choice.id)}
            onDelete={() => actions.deleteChoice(questionId, choice.id)}
            canDelete={choices.length > 2}
            disabled={disabled}
          />
        ))}
      </div>

      <button
        type="button"
        className="qb-choices__add"
        onClick={() => actions.addChoice(questionId)}
        disabled={disabled || choices.length >= QUIZ_MCQ_MAX_OPTIONS}
        title={
          choices.length >= QUIZ_MCQ_MAX_OPTIONS
            ? `Maximum ${QUIZ_MCQ_MAX_OPTIONS} choices per question`
            : undefined
        }
      >
        + Add Another Choice
      </button>
    </div>
  );
}
