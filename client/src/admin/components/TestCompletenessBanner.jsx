import { TestWizardProgress } from './TestWizardProgress';

/** @deprecated Prefer TestWizardProgress directly. */
export function TestCompletenessBanner({ completeness, title }) {
  if (title) {
    return (
      <div>
        <p className="body-md admin-courses__muted" style={{ marginTop: '0.75rem' }}>
          {title}
        </p>
        <TestWizardProgress completeness={completeness} />
      </div>
    );
  }
  return <TestWizardProgress completeness={completeness} />;
}
