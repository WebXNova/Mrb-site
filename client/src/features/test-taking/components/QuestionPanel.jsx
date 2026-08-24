import { memo } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';
import QuestionOptions from './QuestionOptions';
import QuestionTip from './QuestionTip';

function QuestionPanel({
  question,
  questionNumber,
  totalQuestions,
  selectedOptionId,
  onSelectOption,
  questionRef,
  disabled,
  layoutMode = 'vertical',
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
    <article className="tt-question" aria-labelledby={`tt-question-heading-${question.id}`}>
      <div className="tt-question__meta">
        <span className="tt-question__badge">Q{questionNumber}</span>
        <span className="tt-question__meta-text">
          Question {questionNumber} of {totalQuestions}
        </span>
        <div className="tt-question__progress" aria-hidden="true">
          <div className="tt-question__progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <h2
        className="tt-question__heading"
        id={`tt-question-heading-${question.id}`}
        tabIndex={-1}
        ref={questionRef}
      >
        Question {questionNumber}
      </h2>

      <div
        className="tt-question__text"
        dangerouslySetInnerHTML={{
          __html: sanitizeStudentRichHtml(question.questionText || ''),
        }}
      />

      {question.questionImageUrl ? (
        <div className="tt-question__image">
          <img
            src={question.questionImageUrl}
            alt="Question illustration"
            className="tt-question__img"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
      ) : null}

      <QuestionTip tipHtml={question.tipHtml} />

      <QuestionOptions
        questionId={question.id}
        options={question.options}
        selectedOptionId={selectedOptionId}
        onSelectOption={onSelectOption}
        disabled={disabled}
        layoutMode={layoutMode}
      />
    </article>
  );
}

export default memo(QuestionPanel);
