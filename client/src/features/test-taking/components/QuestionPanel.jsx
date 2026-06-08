import { memo } from 'react';
import DOMPurify from 'dompurify';
import QuestionOptions from './QuestionOptions';

function QuestionPanel({
  question,
  questionNumber,
  totalQuestions,
  selectedOptionId,
  onSelectOption,
  questionRef,
  disabled,
}) {
  if (!question) {
    return (
      <article className="tt-question tt-question--empty">
        <p>No questions available for this test.</p>
      </article>
    );
  }

  const progressPct = totalQuestions > 0 ? Math.round((questionNumber / totalQuestions) * 100) : 0;

  return (
    <article className="tt-question" aria-labelledby="tt-question-heading">
      <div className="tt-question__meta">
        <span className="tt-question__badge">Q{questionNumber}</span>
        <div className="tt-question__progress" aria-hidden="true">
          <div className="tt-question__progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <h2
        className="tt-question__heading"
        id="tt-question-heading"
        tabIndex={-1}
        ref={questionRef}
      >
        Question {questionNumber}
      </h2>

      <div
        className="tt-question__text"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(question.questionText || ''),
        }}
      />

      <QuestionOptions
        questionId={question.id}
        options={question.options}
        selectedOptionId={selectedOptionId}
        onSelectOption={onSelectOption}
        disabled={disabled}
      />
    </article>
  );
}

export default memo(QuestionPanel);
