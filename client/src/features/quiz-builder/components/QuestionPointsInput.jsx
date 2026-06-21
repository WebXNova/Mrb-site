import { QUIZ_MCQ_MIN_POINTS } from '../validation/quizMcqLimits.js';

/**
 * @param {{ value: number, onChange: (value: number) => void, disabled?: boolean, questionNumber: number }} props
 */
export default function QuestionPointsInput({ value, onChange, disabled = false, questionNumber }) {
  function handleChange(event) {
    const raw = event.target.value;
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onChange(parsed);
  }

  function handleBlur() {
    const current = Number(value);
    if (!Number.isFinite(current) || current < QUIZ_MCQ_MIN_POINTS) {
      onChange(QUIZ_MCQ_MIN_POINTS);
    }
  }

  const label = value === 1 ? 'point' : 'points';

  return (
    <div className="qb-points">
      <label className="visually-hidden" htmlFor={`qb-points-${questionNumber}`}>
        Points for question {questionNumber}
      </label>
      <input
        id={`qb-points-${questionNumber}`}
        type="number"
        className="qb-points__input"
        min={QUIZ_MCQ_MIN_POINTS}
        step="0.5"
        value={value || ''}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={`Points for question ${questionNumber}`}
      />
      <span className="qb-points__label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
