import { memo, useCallback } from 'react';
import QuestionPanel from './QuestionPanel';
import SectionDivider from './SectionDivider';

function AllQuestionsView({
  examItems,
  totalQuestions,
  answers,
  onSelectOption,
  layoutMode,
  disabled,
  questionRefs,
  onQuestionVisible,
}) {
  const setQuestionRef = useCallback(
    (questionId) => (node) => {
      if (questionRefs?.current) {
        questionRefs.current.set(String(questionId), node);
      }
    },
    [questionRefs]
  );

  return (
    <div className="tt-all-questions">
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
              layoutMode={layoutMode}
              disabled={disabled}
            />
          </div>
        );
      })}
    </div>
  );
}

export default memo(AllQuestionsView);
