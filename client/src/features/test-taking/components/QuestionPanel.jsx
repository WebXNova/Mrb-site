import { memo } from 'react';
import { sanitizeStudentRichHtml } from '../../../security/sanitizeStudentRichHtml.js';
import { stripExamContentLabels } from '../utils/examContentDisplay.js';
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
  showQuestionTotal = true,
}) {
  if (!question) {
    return (
      <article className="tt-question tt-question--empty">
        <p>No questions available for this test.</p>
      </article>
    );
  }

  return (
    <article className="tt-question" aria-labelledby={`tt-question-heading-${question.id}`}>
      <h2
        className="tt-question__heading"
        id={`tt-question-heading-${question.id}`}
        tabIndex={-1}
        ref={questionRef}
      >
        Question {questionNumber}
        {showQuestionTotal ? (
          <span className="tt-question__heading-total"> of {totalQuestions}</span>
        ) : null}
      </h2>

      <div
        className="tt-question__text"
        dangerouslySetInnerHTML={{
          __html: sanitizeStudentRichHtml(
            stripExamContentLabels(question.questionText || '') ||
              '<p>This question could not be displayed.</p>'
          ),
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
      />
    </article>
  );
}

export default memo(QuestionPanel);
