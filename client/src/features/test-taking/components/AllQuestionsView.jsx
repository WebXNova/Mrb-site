import { memo, useCallback, useEffect, useRef } from 'react';
import QuestionPanel from './QuestionPanel';
import SectionDivider from './SectionDivider';

function AllQuestionsView({
  examItems,
  totalQuestions,
  answers,
  onSelectOption,
  disabled,
  questionRefs,
  onQuestionVisible,
  scrollRootRef,
  isFullscreen = false,
}) {
  const listRef = useRef(null);

  const setQuestionRef = useCallback(
    (questionId) => (node) => {
      if (questionRefs?.current) {
        questionRefs.current.set(String(questionId), node);
      }
    },
    [questionRefs]
  );

  useEffect(() => {
    if (!onQuestionVisible) return undefined;
    const rootEl = listRef.current;
    if (!rootEl) return undefined;

    const blocks = Array.from(rootEl.querySelectorAll('[data-question-id]'));
    if (!blocks.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const nextId = visible[0]?.target?.getAttribute('data-question-id');
        if (nextId) onQuestionVisible(nextId);
      },
      {
        root: rootEl.closest('.tt-exam__body') || (isFullscreen ? scrollRootRef?.current || null : null),
        rootMargin: '-8px 0px -48% 0px',
        threshold: [0, 0.2, 0.5],
      }
    );

    blocks.forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  }, [examItems, isFullscreen, onQuestionVisible, scrollRootRef]);

  return (
    <div className="tt-all-questions" ref={listRef}>
      {examItems.map((item) => {
        if (item.type === 'section') {
          return (
            <SectionDivider
              key={item.key}
              section={item.section}
              inline
            />
          );
        }

        const question = item.question;
        return (
          <div
            key={item.key}
            className="tt-all-questions__block"
            id={`tt-q-${question.id}`}
            ref={setQuestionRef(question.id)}
            data-question-id={question.id}
            onFocus={() => onQuestionVisible?.(String(question.id))}
          >
            <QuestionPanel
              question={question}
              questionNumber={item.questionNumber}
              totalQuestions={totalQuestions}
              selectedOptionId={answers[question.id] ?? null}
              onSelectOption={onSelectOption}
              showQuestionTotal={false}
              disabled={disabled}
            />
          </div>
        );
      })}
    </div>
  );
}

export default memo(AllQuestionsView);
