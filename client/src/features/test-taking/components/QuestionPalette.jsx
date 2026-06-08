import { memo } from 'react';
import { getQuestionStatusLabel } from '../utils/questionStatus';

const PaletteButton = memo(function PaletteButton({ number, status, onClick }) {
  return (
    <button
      type="button"
      className={`tt-palette__btn tt-palette__btn--${status}`}
      onClick={onClick}
      aria-label={`Question ${number}: ${getQuestionStatusLabel(status)}`}
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
}) {
  return (
    <aside className={`tt-palette ${className}`.trim()} aria-labelledby="tt-palette-heading">
      <h2 className="tt-palette__heading" id="tt-palette-heading">
        Question palette
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
          Not answered
        </li>
        <li>
          <span className="tt-palette__swatch tt-palette__swatch--unvisited" aria-hidden="true" />
          Not visited
        </li>
      </ul>

      <div className="tt-palette__grid" role="navigation" aria-label="Jump to question">
        {questionIds.map((id, index) => {
          let status = 'unvisited';
          if (id === currentId) status = 'current';
          else if (answers[id] != null && answers[id] !== '') status = 'answered';
          else if (visited.has(id)) status = 'visited';

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
