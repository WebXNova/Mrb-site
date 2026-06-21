import CheckIcon from '@mui/icons-material/Check';

const STEP_LABELS = ['Course details', 'Pricing', 'Batch delivery', 'Subjects', 'Review'];

export default function CourseWizardProgress({ stepIndex }) {
  const pct = Math.round(((stepIndex + 1) / STEP_LABELS.length) * 100);

  return (
    <div className="course-wizard-progress" aria-label="Course creation progress">
      <div className="course-wizard-progress__meta">
        <span className="course-wizard-progress__label">
          Step {stepIndex + 1} of {STEP_LABELS.length}: {STEP_LABELS[stepIndex]}
        </span>
        <span className="course-wizard-progress__pct" aria-live="polite">
          {pct}% complete
        </span>
      </div>
      <div className="course-wizard-progress__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="course-wizard-progress__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="course-wizard-progress__steps">
        {STEP_LABELS.map((label, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          return (
            <li
              key={label}
              className={`course-wizard-progress__step${current ? ' course-wizard-progress__step--current' : ''}${
                done ? ' course-wizard-progress__step--done' : ''
              }`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="course-wizard-progress__step-marker" aria-hidden>
                {done ? <CheckIcon sx={{ fontSize: 14 }} /> : i + 1}
              </span>
              <span className="course-wizard-progress__step-label">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
