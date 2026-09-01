import { Link } from 'react-router-dom';
import { getWizardPhaseKey, TEST_NAV_ITEMS } from '../config/testWizardConfig';

export {
  getWizardPhaseKey,
  getWizardPreviousPhase as getTestWizardPreviousStep,
  TEST_NAV_ITEMS as TEST_WIZARD_STEPS,
} from '../config/testWizardConfig';

/**
 * Persistent test workspace tabs: Dashboard, Settings, Questions, Publish, Results.
 * @param {{ testId: string|number, activeStep: string, editMode?: boolean }} props
 */
export default function TestWizardNav({ testId, activeStep }) {
  if (!testId) return null;

  const activePhase = getWizardPhaseKey(activeStep);

  return (
    <nav className="admin-test-edit-nav" aria-label="Test management">
      {TEST_NAV_ITEMS.map((phase) => (
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
