import { useCallback, useState } from 'react';
import QuestionCard from './QuestionCard.jsx';

/**
 * @param {{
 *   questions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *   actions: Record<string, Function>,
 *   disabled?: boolean,
 * }} props
 */
export default function QuestionCardList({ questions, actions, disabled = false }) {
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

  const handleInsertAt = useCallback(
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

  return (
    <div className="qb-question-list" role="list" aria-label="Test questions">
      {questions.map((question, index) => {
        const questionNumber = index + 1;
        return (
          <div key={question.id} className="qb-question-list__item" role="listitem">
            <button
              type="button"
              className="qb-insert-btn qb-insert-btn--gap"
              disabled={disabled}
              onClick={() => handleInsertAt(index)}
              aria-label={`Add question above question ${questionNumber}`}
              title="Add question above"
            >
              +
            </button>
            <QuestionCard
              question={question}
              index={index}
              actions={actions}
              disabled={disabled}
              isDragging={dragIndex === index}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
            <button
              type="button"
              className="qb-insert-btn qb-insert-btn--card-end"
              disabled={disabled}
              onClick={() => handleInsertAt(index + 1)}
              aria-label={`Add question below question ${questionNumber}`}
              title="Add question below"
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
