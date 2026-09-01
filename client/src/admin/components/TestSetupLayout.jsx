import { useEffect, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { getWizardStepEyebrow, TEST_WIZARD_BUTTONS } from '../config/testWizardConfig';
import { useTestCompleteness } from '../hooks/useTestCompleteness';
import { testPageHeading } from '../hooks/useTestTitle';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import AdminTestPageHeader from './AdminTestPageHeader';
import PublishedTestEditBanner from './PublishedTestEditBanner';
import TestWizardNav from './TestWizardNav';
import { TestWizardProgress } from './TestWizardProgress';
import '../styles/admin-test-setup-redesign.css';

/**
 * Shared chrome for the unified Setup step (step 1 of 3).
 */
export default function TestSetupLayout({ testId, children }) {
  const token = getAdminToken();
  const { completeness, reload: reloadCompleteness } = useTestCompleteness(testId);
  const [testTitle, setTestTitle] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [loadError, setLoadError] = useState('');

  const isPublished = isTestPublishedStatus(testStatus);

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
    <section className="admin-page admin-page--tests admin-page--test-setup">
      <section className="admin-card">
        <AdminTestPageHeader
          title={testPageHeading(testTitle, testId)}
          backLabel={TEST_WIZARD_BUTTONS.backToTests}
        />

        <p className="admin-test-step-label">{getWizardStepEyebrow('setup')}</p>

        <TestWizardNav testId={testId} activeStep="setup" />

        <TestWizardProgress completeness={completeness} testId={testId} activeStep="setup" />

        {isPublished ? <PublishedTestEditBanner testTitle={testTitle} /> : null}

        {loadError ? <p className="admin-error">{loadError}</p> : null}

        <div className="admin-test-edit-body">
          {typeof children === 'function'
            ? children({ readOnly: false, isPublished, reloadCompleteness, completeness })
            : children}
        </div>

        <p className="admin-test-edit-footer-hint">
          <Link className="admin-test-edit-footer-hint__link" to={adminRoute(`tests/${testId}/questions`)}>
            {TEST_WIZARD_BUTTONS.continueToQuestions} →
          </Link>
        </p>
      </section>
    </section>
  );
}
