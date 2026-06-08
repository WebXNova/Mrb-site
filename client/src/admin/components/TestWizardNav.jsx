import { Link } from 'react-router-dom';

export const TEST_WIZARD_STEPS = [
  {
    key: 'basic-info',
    label: 'Basic Info',
    path: (testId) => (testId ? `/admin/tests/${testId}/edit/basic-info` : '/admin/tests/new'),
  },
  { key: 'rules', label: 'Rules', path: (testId) => `/admin/tests/${testId}/rules` },
  { key: 'settings', label: 'Settings', path: (testId) => `/admin/tests/${testId}/settings` },
  { key: 'questions', label: 'Questions', path: (testId) => `/admin/tests/${testId}/questions` },
];

/**
 * Step tabs for create/edit wizard (requires testId except on create-only views).
 */
export default function TestWizardNav({ testId, activeStep }) {
  if (!testId) return null;

  return (
    <nav className="admin-test-edit-nav" aria-label="Test wizard steps">
      {TEST_WIZARD_STEPS.map((step) => (
        <Link
          key={step.key}
          className={`admin-test-edit-nav__link${activeStep === step.key ? ' admin-test-edit-nav__link--active' : ''}`}
          to={step.path(testId)}
          aria-current={activeStep === step.key ? 'page' : undefined}
        >
          {step.label}
        </Link>
      ))}
      <Link
        className={`admin-test-edit-nav__link${activeStep === 'details' ? ' admin-test-edit-nav__link--active' : ''}`}
        to={`/admin/tests/${testId}/details`}
        aria-current={activeStep === 'details' ? 'page' : undefined}
      >
        Details
      </Link>
    </nav>
  );
}

export function getTestWizardPreviousStep(activeStep, testId) {
  const index = TEST_WIZARD_STEPS.findIndex((s) => s.key === activeStep);
  if (index <= 0 || !testId) return null;
  const prev = TEST_WIZARD_STEPS[index - 1];
  return { label: prev.label, to: prev.path(testId) };
}

export const TEST_EDIT_STEPS = [
  { key: 'basic-info', label: 'Basic Info', path: (testId) => `/admin/tests/${testId}/edit/basic-info` },
  { key: 'rules', label: 'Rules', path: (testId) => `/admin/tests/${testId}/edit/rules` },
  { key: 'settings', label: 'Settings', path: (testId) => `/admin/tests/${testId}/edit/settings` },
];

export function getTestEditPreviousStep(activeStep, testId) {
  const index = TEST_EDIT_STEPS.findIndex((s) => s.key === activeStep);
  if (index <= 0 || !testId) return null;
  const prev = TEST_EDIT_STEPS[index - 1];
  return { label: prev.label, to: prev.path(testId) };
}
