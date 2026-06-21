import TestWizardMissingHint from './TestWizardMissingHint';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import TestPublishCallout from './TestPublishCallout';
import TestStatusBadge, { formatTestStatusLabel } from './TestStatusBadge';

export function formatTestLifecycleStatus(status) {
  return formatTestStatusLabel(status);
}

function buildWizardPhases(completeness, published) {
  const setupComplete =
    completeness.step1_complete && completeness.step2_complete && completeness.step3_complete;

  return [
    { key: 'setup', label: 'Setup', done: setupComplete },
    { key: 'questions', label: 'Questions', done: completeness.step4_complete },
    {
      key: 'publish',
      label: 'Publish',
      done: published || completeness.can_publish,
    },
  ];
}

/**
 * Wizard step completion from GET /admin/tests/:id/completeness.
 */
export function TestWizardProgress({
  completeness,
  showMissingDetails = true,
  onPublish,
  publishing = false,
  readOnly = false,
  variant = 'default',
  testId = null,
  activeStep = null,
}) {
  if (!completeness) return null;

  const status = completeness.lifecycle_status;
  const missing = completeness.missing_fields || [];
  const published = readOnly || isTestPublishedStatus(status);
  const showPublishCta = Boolean(onPublish) && completeness.can_publish && !published;
  const steps = buildWizardPhases(completeness, published);

  function renderMissingHint() {
    if (!showMissingDetails || !missing.length) return null;
    return (
      <TestWizardMissingHint
        missingFields={missing}
        activeStep={activeStep}
        testId={testId}
        variant="inline"
      />
    );
  }

  if (variant === 'compact') {
    return (
      <div className="admin-test-progress admin-test-progress--compact">
        <div className="admin-test-progress__compact-head">
          <p className="admin-test-progress__status">
            <TestStatusBadge status={status} />
          </p>
          <ul className="admin-test-progress__steps">
            {steps.map((step, index) => (
              <li
                key={step.key}
                className={`admin-test-progress__step${step.done ? ' admin-test-progress__step--done' : ''}`}
              >
                <span className="admin-test-progress__icon" aria-hidden>
                  {step.done ? '✓' : index + 1}
                </span>
                <span className="admin-test-progress__step-label">{step.label}</span>
              </li>
            ))}
          </ul>
        </div>
        {renderMissingHint()}
        {showMissingDetails && !missing.length && completeness.can_publish && !published ? (
          <p className="admin-test-progress__hint admin-test-progress__hint--success">
            Ready to publish.
          </p>
        ) : null}
        {showPublishCta ? (
          <TestPublishCallout onPublish={onPublish} publishing={publishing} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="admin-test-progress">
      <p className="admin-test-progress__status">
        <strong>Status:</strong> <TestStatusBadge status={status} />
      </p>
      <ul className="admin-test-progress__steps">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`admin-test-progress__step${step.done ? ' admin-test-progress__step--done' : ''}`}
          >
            <span className="admin-test-progress__icon" aria-hidden>
              {step.done ? '✓' : index + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ul>
      {renderMissingHint()}
      {showMissingDetails && !missing.length && completeness.can_publish && !published ? (
        <p className="admin-test-progress__hint admin-test-progress__hint--success">
          Ready to publish.
        </p>
      ) : null}
      {showPublishCta ? (
        <TestPublishCallout onPublish={onPublish} publishing={publishing} />
      ) : null}
    </div>
  );
}
