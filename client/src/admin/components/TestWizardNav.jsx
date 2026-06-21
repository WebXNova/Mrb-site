import { Link } from 'react-router-dom';
import { getWizardPhaseKey, TEST_WIZARD_EDIT_PHASES, TEST_WIZARD_PHASES } from '../config/testWizardConfig';

export {
  getWizardPhaseKey,
  getWizardPreviousPhase as getTestWizardPreviousStep,
  TEST_WIZARD_PHASES as TEST_WIZARD_STEPS,
} from '../config/testWizardConfig';

/**
 * Top-level wizard tabs: Setup → Questions → Review.
 * @param {{ testId: string|number, activeStep: string, editMode?: boolean }} props
 */
export default function TestWizardNav({ testId, activeStep, editMode = false }) {
  if (!testId) return null;

  const phases = editMode ? TEST_WIZARD_EDIT_PHASES : TEST_WIZARD_PHASES;
  const activePhase = getWizardPhaseKey(activeStep);

  return (
    <nav className="admin-test-edit-nav" aria-label="Test builder steps">
      {phases.map((phase) => (
        <Link
          key={phase.key}
          className={`admin-test-edit-nav__link${
            activePhase === phase.key ? ' admin-test-edit-nav__link--active' : ''
          }`}
          to={phase.path(testId)}
          aria-current={activePhase === phase.key ? 'page' : undefined}
        >
          {phase.label}
        </Link>
      ))}
    </nav>
  );
}
