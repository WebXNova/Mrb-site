import { useCallback, useMemo, useState } from 'react';
import { validateQuizMcqQuestionClient } from '../validation/quizMcqClientValidation.js';
import { QuizCardEditorProvider } from '../ribbon/QuizCardEditorProvider.jsx';
import AnswerOptionsList from './AnswerOptionsList.jsx';
import ExplanationSection from './ExplanationSection.jsx';
import QuestionPointsInput from './QuestionPointsInput.jsx';
import QuizCardRibbon from './QuizCardRibbon.jsx';
import QuizRichField from './QuizRichField.jsx';

/**
 * @param {{
 *   question: import('../types/quizBuilder.types.js').QuizQuestion,
 *   index: number,
 *   actions: Record<string, Function>,
 *   disabled?: boolean,
 *   isDragging?: boolean,
 *   onDragStart: (index: number) => void,
 *   onDragEnd: () => void,
 *   onDragOver: (index: number) => void,
 *   onDrop: (index: number) => void,
 * }} props
 */
export default function QuestionCard({
  question,
  index,
  actions,
  disabled = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) {
  const [dragOver, setDragOver] = useState(false);
  const questionNumber = index + 1;
  const titleId = `qb-question-title-${question.id}`;
  const validation = useMemo(
    () => validateQuizMcqQuestionClient(question, index),
    [question, index]
  );

  const handleDelete = useCallback(() => {
    if (disabled) return;
    const confirmed = window.confirm(
      `Delete question ${questionNumber}? This cannot be undone.`
    );
    if (confirmed) {
      actions.deleteQuestion(question.id);
    }
  }, [actions, disabled, question.id, questionNumber]);

  function handleDragOver(event) {
    event.preventDefault();
    setDragOver(true);
    onDragOver(index);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    onDrop(index);
  }

  return (
    <article
      className={[
        'qb-question-card',
        question.collapsed ? 'qb-question-card--collapsed' : '',
        isDragging ? 'qb-question-card--dragging' : '',
        dragOver ? 'qb-question-card--drag-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={titleId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="qb-question-card__rail">
        <button
          type="button"
          className="qb-question-card__drag"
          draggable={!disabled}
          onDragStart={() => onDragStart(index)}
          onDragEnd={onDragEnd}
          disabled={disabled}
          aria-label={`Drag to reorder question ${questionNumber}`}
          title="Drag to reorder"
        >
          ⠿
        </button>
        <button
          type="button"
          className="qb-question-card__icon-btn"
          onClick={() => actions.toggleCollapsed(question.id)}
          aria-expanded={!question.collapsed}
          aria-controls={`qb-question-body-${question.id}`}
          aria-label={question.collapsed ? `Expand question ${questionNumber}` : `Collapse question ${questionNumber}`}
          title={question.collapsed ? 'Expand' : 'Collapse'}
        >
          {question.collapsed ? '▸' : '▾'}
        </button>
        <button
          type="button"
          className="qb-question-card__icon-btn"
          onClick={() => actions.duplicateQuestion(question.id)}
          disabled={disabled}
          aria-label={`Duplicate question ${questionNumber}`}
          title="Duplicate"
        >
          ⧉
        </button>
        <button
          type="button"
          className="qb-question-card__icon-btn qb-question-card__icon-btn--danger"
          onClick={handleDelete}
          disabled={disabled}
          aria-label={`Delete question ${questionNumber}`}
          title="Delete"
        >
          ×
        </button>
      </div>

      <div className="qb-question-card__main">
        <header className="qb-question-card__header">
          <div className="qb-question-card__title-row">
            <span className="qb-question-card__number" aria-hidden="true">
              {questionNumber}.
            </span>
            <label className="visually-hidden" htmlFor={titleId}>
              Question {questionNumber} title
            </label>
            <input
              id={titleId}
              type="text"
              className="qb-question-card__title-input"
              value={question.title}
              onChange={(e) =>
                actions.updateQuestion(question.id, { title: e.target.value })
              }
              placeholder="Question"
              disabled={disabled}
            />
          </div>
          <QuestionPointsInput
            value={question.points}
            onChange={(points) => actions.updateQuestion(question.id, { points })}
            disabled={disabled}
            questionNumber={questionNumber}
          />
        </header>

        {!question.collapsed ? (
          <QuizCardEditorProvider disabled={disabled}>
            <div className="qb-question-card__ribbon">
              <QuizCardRibbon />
            </div>

            <div
              id={`qb-question-body-${question.id}`}
              className="qb-question-card__body"
            >
              {!validation.valid && !disabled ? (
                <ul className="qb-question-card__validation" role="alert" aria-live="polite">
                  {validation.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}

              <div className="qb-question-card__stem">
                <p className="qb-question-card__stem-label" id={`qb-stem-label-${question.id}`}>
                  Question Text
                </p>
                <QuizRichField
                  editorId="question"
                  value={question.questionText}
                  onChange={(html) =>
                    actions.updateQuestion(question.id, { questionText: html })
                  }
                  placeholder="Enter your question here…"
                  ariaLabel={`Question ${questionNumber} text`}
                  disabled={disabled}
                />
              </div>

              <AnswerOptionsList
                question={question}
                actions={actions}
                disabled={disabled}
              />

              <ExplanationSection
                showExplanation={question.showExplanation}
                explanation={question.explanation}
                questionNumber={questionNumber}
                onToggle={(enabled) =>
                  actions.updateQuestion(question.id, {
                    showExplanation: enabled,
                    explanation: enabled ? question.explanation : '',
                  })
                }
                onChange={(text) =>
                  actions.updateQuestion(question.id, { explanation: text })
                }
                disabled={disabled}
              />
            </div>
          </QuizCardEditorProvider>
        ) : (
          <p className="qb-question-card__collapsed-preview">
            {question.title || 'Empty question'}
          </p>
        )}
      </div>
    </article>
  );
}
