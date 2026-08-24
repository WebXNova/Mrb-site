import { Outlet, useLocation, useParams } from 'react-router-dom';
import { adminRoute } from '../../../config/adminPaths';
import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import { getAdminToken } from '../../../auth/session';
import { TEST_WIZARD_BUTTONS } from '../../config/testWizardConfig';
import AdminTestPageHeader from '../AdminTestPageHeader';
import PublishedTestReadOnlyBanner from '../PublishedTestReadOnlyBanner';
import TestDashboardPrimaryAction from '../TestDashboardPrimaryAction';
import { isTestPublishedStatus } from '../../utils/testBasicInfoValidation';
import '../../styles/admin-test-workspace.css';

function isTestDashboardRoute(pathname) {
  return /\/tests\/[^/]+\/dashboard\/?$/.test(String(pathname || ''));
}

function isTestSettingsRoute(pathname) {
  return /\/tests\/[^/]+\/settings\/?$/.test(String(pathname || ''));
}

/**
 * Shared layout for test admin pages (Dashboard, Settings, Questions, Publish, Results).
 */
export default function TestWorkspaceLayout() {
  const { testId } = useParams();
  const { pathname } = useLocation();
  const isDashboard = isTestDashboardRoute(pathname);
  const isSettings = isTestSettingsRoute(pathname);
  const token = getAdminToken();
  const [testTitle, setTestTitle] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadTest = useCallback(() => {
    if (!testId) return Promise.resolve();
    setLoadError('');

    return adminApi
      .getTest(token, testId)
      .then((response) => {
        const test = response?.data;
        if (!test) {
          setLoadError('Test not found.');
          return;
        }
        setTestTitle(test.title ?? '');
        setTestStatus(test.status ?? '');
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
      }`}
    >
      <div className="test-workspace">
        <div className="test-workspace__main">
          <section className="admin-card test-workspace__card">
            <AdminTestPageHeader
              title={pageTitle}
              backTo={adminRoute('tests')}
              backLabel={isSettings ? null : TEST_WIZARD_BUTTONS.backToTests}
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
            {published ? <PublishedTestReadOnlyBanner /> : null}
            {loadError ? <p className="admin-error">{loadError}</p> : null}
            <Outlet
              context={{
                testId,
                readOnly: published,
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
