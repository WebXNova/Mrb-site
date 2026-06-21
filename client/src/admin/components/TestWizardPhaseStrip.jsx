import { TEST_WIZARD_PHASES } from '../config/testWizardConfig';

/**
 * Non-interactive step indicator (e.g. create test before testId exists).
 * @param {{ activePhase?: string }} props
 */
export default function TestWizardPhaseStrip({ activePhase = 'setup' }) {
  const activeIndex = TEST_WIZARD_PHASES.findIndex((phase) => phase.key === activePhase);

  return (
    <ol className="admin-test-phase-strip" aria-label="Test builder progress">
      {TEST_WIZARD_PHASES.map((phase, index) => {
        const isActive = index === activeIndex;
        const isDone = activeIndex > index;

        return (
          <li
            key={phase.key}
            className={`admin-test-phase-strip__item${
              isActive ? ' admin-test-phase-strip__item--active' : ''
            }${isDone ? ' admin-test-phase-strip__item--done' : ''}`}
            aria-current={isActive ? 'step' : undefined}
          >
            <span className="admin-test-phase-strip__index" aria-hidden="true">
              {isDone ? '✓' : index + 1}
            </span>
            <span className="admin-test-phase-strip__label">{phase.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
