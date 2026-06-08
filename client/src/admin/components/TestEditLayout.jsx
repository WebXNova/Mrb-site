import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useTestCompleteness } from '../hooks/useTestCompleteness';
import { testPageHeading } from '../hooks/useTestTitle';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import AdminTestPageHeader from './AdminTestPageHeader';
import { TEST_EDIT_STEPS, getTestEditPreviousStep } from './TestWizardNav';
import { TestWizardProgress } from './TestWizardProgress';

export default function TestEditLayout({ testId, activeStep, stepLabel, children }) {
  const token = getAdminToken();
  const { completeness, reload: reloadCompleteness } = useTestCompleteness(testId);
  const [testTitle, setTestTitle] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [loadError, setLoadError] = useState('');

  const isPublished = isTestPublishedStatus(testStatus);
  const previousStep = getTestEditPreviousStep(activeStep, testId);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');

    adminApi
      .getTest(token, testId)
      .then((response) => {
        if (cancelled) return;
        const test = response?.data;
        if (!test) {
          setLoadError('Test not found.');
          return;
        }
        setTestTitle(test.title ?? '');
        setTestStatus(test.status ?? '');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load test.');
      });

    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader
          title={testPageHeading(testTitle, testId)}
          previousTo={previousStep?.to}
          previousLabel={previousStep?.label}
        />

        {stepLabel ? <p className="admin-test-step-label">{stepLabel}</p> : null}

        <nav className="admin-test-edit-nav" aria-label="Edit test steps">
          {TEST_EDIT_STEPS.map((step) => (
            <Link
              key={step.key}
              className={`admin-test-edit-nav__link${activeStep === step.key ? ' admin-test-edit-nav__link--active' : ''}`}
              to={step.path(testId)}
              aria-current={activeStep === step.key ? 'page' : undefined}
            >
              {step.label}
            </Link>
          ))}
          <Link className="admin-test-edit-nav__link" to={`/admin/tests/${testId}/questions`}>
            Questions
          </Link>
          <Link className="admin-test-edit-nav__link" to={`/admin/tests/${testId}/details`}>
            Details
          </Link>
        </nav>

        <TestWizardProgress completeness={completeness} />

        {isPublished ? (
          <p className="admin-test-alert admin-test-alert--info" role="status">
            This test is published (public). You can update basic info, rules, and settings; question links stay locked.
          </p>
        ) : null}

        {loadError ? <p className="admin-error">{loadError}</p> : null}

        <div style={{ marginTop: 'var(--space-5)' }}>
          {typeof children === 'function' ? children({ readOnly: false, reloadCompleteness }) : children}
        </div>
      </section>
    </section>
  );
}
