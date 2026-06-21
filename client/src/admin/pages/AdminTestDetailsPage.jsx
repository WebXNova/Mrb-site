import { useCallback, useEffect, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { getWizardStepEyebrow, TEST_WIZARD_BUTTONS } from '../config/testWizardConfig';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import TestDetailsView from '../components/TestDetailsView';
import TestWizardNav from '../components/TestWizardNav';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';

export default function AdminTestDetailsPage() {
  const token = getAdminToken();
  const { testId } = useParams();
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [test, setTest] = useState(null);
  const [rules, setRules] = useState(null);
  const [settings, setSettings] = useState(null);
  const [completeness, setCompleteness] = useState(null);
  const [courseTitle, setCourseTitle] = useState('—');
  const [questionCount, setQuestionCount] = useState(0);

  const loadDetails = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [testRes, rulesRes, settingsRes, completenessRes, coursesRes] = await Promise.all([
        adminApi.getTest(token, testId),
        adminApi.getTestRules(token, testId),
        adminApi.getTestSettings(token, testId),
        adminApi.getTestCompleteness(token, testId),
        adminApi.courses(token),
      ]);

      const testData = testRes?.data;
      if (!testData) {
        setLoadError('Test not found.');
        return;
      }

      setTest(testData);
      setRules(rulesRes?.data || {});
      setSettings(settingsRes?.data || {});
      const completenessData = completenessRes?.data || null;
      setCompleteness(completenessData);
      setQuestionCount(Number(completenessData?.question_count ?? 0));

      const courses = Array.isArray(coursesRes?.data) ? coursesRes.data : [];
      const course = courses.find((row) => Number(row.id) === Number(testData.courseId));
      setCourseTitle(course?.title || (testData.courseId ? `Course #${testData.courseId}` : '—'));
    } catch (err) {
      setLoadError(err.message || 'Failed to load test details.');
    } finally {
      setIsLoading(false);
    }
  }, [token, testId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const published = Boolean(test && isTestPublishedStatus(test.status));

  const pageTitle = test?.title?.trim() || (isLoading ? 'Loading…' : `Test #${testId}`);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader title={pageTitle} backLabel={TEST_WIZARD_BUTTONS.backToTests}>
          {published ? (
            <Link className="btn btn--primary btn--sm" to={adminRoute(`tests/${testId}/edit`)}>
              Edit
            </Link>
          ) : null}
          <Link className="btn btn--ghost btn--sm" to={adminRoute(`tests/${testId}/questions`)}>
            {published ? 'View questions' : 'Questions'}
          </Link>
          <Link className="btn btn--ghost btn--sm" to={adminRoute(`tests/${testId}/setup`)}>
            {published ? 'View setup' : 'Setup'}
          </Link>
        </AdminTestPageHeader>

        <p className="admin-test-step-label">{getWizardStepEyebrow('publish')}</p>

        <TestWizardNav testId={testId} activeStep="publish" />

        {isLoading ? (
          <p className="body-md admin-courses__muted">Loading test details…</p>
        ) : loadError ? (
          <p className="admin-error">{loadError}</p>
        ) : (
          <TestDetailsView
            testId={testId}
            test={test}
            rules={rules}
            settings={settings}
            completeness={completeness}
            courseTitle={courseTitle}
            questionCount={questionCount}
            onPublished={loadDetails}
            publishSummary={completeness?.publish_summary}
            summaryLoading={isLoading}
            readOnly={published}
          />
        )}
      </section>
    </section>
  );
}
