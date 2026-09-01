import { Outlet, useLocation, useParams } from 'react-router-dom';
import { adminRoute } from '../../../config/adminPaths';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import { getAdminToken } from '../../../auth/session';
import { TEST_WIZARD_BUTTONS } from '../../config/testWizardConfig';
import AdminTestPageHeader from '../AdminTestPageHeader';
import PublishedTestEditBanner from '../PublishedTestEditBanner';
import TestDashboardPrimaryAction from '../TestDashboardPrimaryAction';
import TestWizardNav from '../TestWizardNav';
import TestWorkspaceSummary from '../TestWorkspaceSummary';
import { isTestPublishedStatus } from '../../utils/testBasicInfoValidation';
import '../../styles/admin-test-workspace.css';

function isTestDashboardRoute(pathname) {
  return /\/tests\/[^/]+\/dashboard\/?$/.test(String(pathname || ''));
}

function isTestSettingsRoute(pathname) {
  return /\/tests\/[^/]+\/settings\/?$/.test(String(pathname || ''));
}

function workspaceNavStep(pathname) {
  const path = String(pathname || '');
  if (/\/tests\/[^/]+\/questions\/?$/.test(path)) return 'questions';
  if (/\/tests\/[^/]+\/settings\/?$/.test(path)) return 'settings';
  if (/\/tests\/[^/]+\/publish\/?$/.test(path)) return 'publish';
  if (/\/tests\/[^/]+\/results\/?$/.test(path)) return 'results';
  return 'dashboard';
}

/**
 * Shared layout for test admin pages (Dashboard, Settings, Questions, Publish, Results).
 */
export default function TestWorkspaceLayout() {
  const { testId } = useParams();
  const { pathname } = useLocation();
  const isDashboard = isTestDashboardRoute(pathname);
  const isSettings = isTestSettingsRoute(pathname);
  const navStep = workspaceNavStep(pathname);
  const token = getAdminToken();
  const [testTitle, setTestTitle] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [test, setTest] = useState(null);
  const [loadError, setLoadError] = useState('');

  const loadTest = useCallback(() => {
    if (!testId) return Promise.resolve();
    setLoadError('');

    return adminApi
      .getTest(token, testId)
      .then((response) => {
        const next = response?.data;
        if (!next) {
          setLoadError('Test not found.');
          setTest(null);
          return;
        }
        setTest(next);
        setTestTitle(next.title ?? '');
        setTestStatus(next.status ?? '');
      })
      .catch((err) => {
        setLoadError(err.message || 'Failed to load test.');
      });
  }, [testId, token]);

  useEffect(() => {
    let cancelled = false;
    loadTest().then(() => {
      if (cancelled) return undefined;
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [loadTest]);

  const published = isTestPublishedStatus(testStatus);
  const pageTitle = testTitle.trim() || `Test #${testId}`;

  return (
    <section
      className={`admin-page admin-page--tests admin-page--test-workspace${
        isDashboard ? ' admin-page--test-dashboard' : ''
      }${isSettings ? ' admin-page--test-settings' : ''}`}
    >
      <div className="test-workspace">
        <div className="test-workspace__main">
          <section
            className={`admin-card test-workspace__card${isSettings ? ' test-workspace__card--settings' : ''}`}
          >
            {isSettings ? null : (
              <AdminTestPageHeader
                title={pageTitle}
                backTo={adminRoute('tests')}
                backLabel={TEST_WIZARD_BUTTONS.backToTests}
                backVariant={isDashboard ? 'link' : 'button'}
              >
                {isDashboard ? (
                  <TestDashboardPrimaryAction
                    testId={testId}
                    testStatus={testStatus}
                    onPublished={loadTest}
                  />
                ) : null}
              </AdminTestPageHeader>
            )}
            {isSettings ? null : <TestWizardNav testId={testId} activeStep={navStep} />}
            {published ? <PublishedTestEditBanner testTitle={testTitle} /> : null}
            {isSettings ? null : <TestWorkspaceSummary test={test} />}
            {loadError ? <p className="admin-error">{loadError}</p> : null}
            <Outlet
              context={{
                testId,
                test,
                readOnly: false,
                isPublished: published,
                testTitle,
                testStatus,
                refreshTest: loadTest,
              }}
            />
          </section>
        </div>
      </div>
    </section>
  );
}
