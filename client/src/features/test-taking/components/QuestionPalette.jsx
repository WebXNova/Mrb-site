import { memo } from 'react';
import { getQuestionStatus, getQuestionStatusLabel } from '../utils/questionStatus';

const PaletteButton = memo(function PaletteButton({ number, status, onClick }) {
  return (
    <button
      type="button"
      className={`tt-palette__btn tt-palette__btn--${status}`}
      onClick={onClick}
      aria-label={`Question ${number}, ${getQuestionStatusLabel(status)}`}
      aria-current={status === 'current' ? 'true' : undefined}
    >
      {number}
    </button>
  );
});

function QuestionPalette({
  questionIds,
  currentId,
  answers,
  visited,
  onJump,
  className = '',
  examTitle,
  subject,
  answeredCount,
  totalQuestions,
}) {
  const total = totalQuestions ?? questionIds.length;
  const answered = answeredCount ?? 0;

  return (
    <aside className={`tt-palette ${className}`.trim()} aria-labelledby="tt-palette-heading">
      <div className="tt-palette__exam-meta">
        <p className="tt-palette__eyebrow">Exam progress</p>
        {examTitle ? <p className="tt-palette__exam-title">{examTitle}</p> : null}
        {subject ? <p className="tt-palette__exam-subject">{subject}</p> : null}
        <p className="tt-palette__exam-stats">
          <strong>{answered}</strong>
          {' of '}
          <strong>{total}</strong>
          {' answered'}
        </p>
      </div>

      <h2 className="tt-palette__heading" id="tt-palette-heading">
        Question Navigator
      </h2>

      <ul className="tt-palette__legend" aria-label="Legend">
        <li>
          <span className="tt-palette__swatch tt-palette__swatch--current" aria-hidden="true" />
          Current
        </li>
        <li>
          <span className="tt-palette__swatch tt-palette__swatch--answered" aria-hidden="true" />
          Answered
        </li>
        <li>
          <span className="tt-palette__swatch tt-palette__swatch--visited" aria-hidden="true" />
          Not Answered
        </li>
        <li>
          <span className="tt-palette__swatch tt-palette__swatch--unvisited" aria-hidden="true" />
          Not Visited
        </li>
      </ul>

      <div className="tt-palette__grid" role="navigation" aria-label="Jump to question">
        {questionIds.map((id, index) => {
          const status = getQuestionStatus({
            questionId: id,
            currentId,
            answers,
            visited,
          });

          return (
            <PaletteButton
              key={id}
              number={index + 1}
              status={status}
              onClick={() => onJump(index)}
            />
          );
        })}
      </div>
    </aside>
  );
}

export default memo(QuestionPalette);
