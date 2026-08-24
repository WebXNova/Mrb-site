import { useCallback, useState } from 'react';
import { getQuestionDisplayNumber, isQuizQuestion, isQuizSection } from '../utils/quizDraftItems.js';
import { parseSubjectId } from '../utils/sectionSubject.js';
import QuestionCard from './QuestionCard.jsx';
import SectionCard from './SectionCard.jsx';

/**
 * @param {{
 *   questions: import('../types/quizBuilder.types.js').QuizDraftItem[],
 *   actions: Record<string, Function>,
 *   disabled?: boolean,
 *   testId?: string|number|null,
 *   subjects?: Array<{ id: number, title: string }>,
 * }} props
 */
export default function QuestionCardList({
  questions,
  actions,
  disabled = false,
  testId = null,
  subjects = [],
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const handleDragStart = useCallback((index) => {
    setDragIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && hoverIndex !== null && dragIndex !== hoverIndex) {
      actions.reorderQuestions(dragIndex, hoverIndex);
    }
    setDragIndex(null);
    setHoverIndex(null);
  }, [actions, dragIndex, hoverIndex]);

  const handleDragOver = useCallback((index) => {
    setHoverIndex(index);
  }, []);

  const handleDrop = useCallback(
    (index) => {
      if (dragIndex !== null && dragIndex !== index) {
        actions.reorderQuestions(dragIndex, index);
      }
      setDragIndex(null);
      setHoverIndex(null);
    },
    [actions, dragIndex]
  );

  const handleInsertQuestionAt = useCallback(
    (index) => {
      if (disabled) return;
      actions.insertQuestionAt(index);
      requestAnimationFrame(() => {
        const cards = document.querySelectorAll('.qb-question-list__item');
        const target = cards[index];
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [actions, disabled]
  );

  const handleInsertSectionAt = useCallback(
    (index) => {
      if (disabled) return;
      actions.insertSectionAt(index);
      requestAnimationFrame(() => {
        const cards = document.querySelectorAll('.qb-question-list__item');
        const target = cards[index];
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [actions, disabled]
  );

  return (
    <div className="qb-question-list" role="list" aria-label="Test questions and sections">
      {questions.map((item, index) => {
        const questionNumber = getQuestionDisplayNumber(questions, index);

        return (
          <div key={item.id} className="qb-question-list__item" role="listitem">
            <div className="qb-insert-row">
              <button
                type="button"
                className="qb-insert-btn qb-insert-btn--gap"
                disabled={disabled}
                onClick={() => handleInsertQuestionAt(index)}
                aria-label={
                  isQuizQuestion(item)
                    ? `Add question above question ${questionNumber}`
                    : 'Add question above section'
                }
                title="Add question above"
              >
                + Question
              </button>
              <button
                type="button"
                className="qb-insert-btn qb-insert-btn--section"
                disabled={disabled}
                onClick={() => handleInsertSectionAt(index)}
                aria-label="Add section above"
                title="Add section above"
              >
                + Section
              </button>
            </div>

            {isQuizSection(item) ? (
              <SectionCard
                section={item}
                index={index}
                actions={actions}
                disabled={disabled}
                isDragging={dragIndex === index}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                testId={testId}
                subjects={subjects}
                usedSubjectIds={questions
                  .filter((row) => isQuizSection(row) && row.id !== item.id)
                  .map((row) => parseSubjectId(row.subjectId))
                  .filter(Boolean)}
              />
            ) : (
              <QuestionCard
                question={item}
                index={index}
                questionNumber={questionNumber}
                actions={actions}
                disabled={disabled}
                isDragging={dragIndex === index}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            )}

            <div className="qb-insert-row qb-insert-row--end">
              <button
                type="button"
                className="qb-insert-btn qb-insert-btn--card-end"
                disabled={disabled}
                onClick={() => handleInsertQuestionAt(index + 1)}
                aria-label="Add question below"
                title="Add question below"
              >
                + Question
              </button>
              <button
                type="button"
                className="qb-insert-btn qb-insert-btn--section qb-insert-btn--card-end"
                disabled={disabled}
                onClick={() => handleInsertSectionAt(index + 1)}
                aria-label="Add section below"
                title="Add section below"
              >
                + Section
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
