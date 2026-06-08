import { formatMissingFields } from '../hooks/useTestCompleteness';
import TestStatusBadge, { formatTestStatusLabel } from './TestStatusBadge';

export function formatTestLifecycleStatus(status) {
  return formatTestStatusLabel(status);
}

/**
 * Wizard step completion from GET /admin/tests/:id/completeness.
 */
export function TestWizardProgress({ completeness, showMissingDetails = true }) {
  if (!completeness) return null;

  const status = completeness.lifecycle_status;
  const missing = completeness.missing_fields || [];

  const steps = [
    { key: 'step1', label: 'Basic Info', done: completeness.step1_complete },
    { key: 'step2', label: 'Rules', done: completeness.step2_complete },
    { key: 'step3', label: 'Settings', done: completeness.step3_complete },
    { key: 'step4', label: 'Questions', done: completeness.step4_complete },
  ];

  return (
    <div className="admin-test-progress">
      <p className="admin-test-progress__status">
        <strong>Current status:</strong>{' '}
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
            {step.label}
          </li>
        ))}
      </ul>
      {showMissingDetails && missing.length ? (
        <p className="admin-error" style={{ margin: '0.75rem 0 0' }}>
          Missing: {formatMissingFields(missing)}
        </p>
      ) : null}
      {showMissingDetails && !missing.length && completeness.can_publish ? (
        <p className="admin-success" style={{ margin: '0.75rem 0 0' }}>
          Test is complete and ready for publish.
        </p>
      ) : null}
    </div>
  );
}
