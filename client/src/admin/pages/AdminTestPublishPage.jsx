import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import TestDetailsView from '../components/TestDetailsView';
import DownloadResultsButton from '../components/DownloadResultsButton';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';

export default function AdminTestPublishPage() {
  const { testId, readOnly: layoutReadOnly, refreshTest } = useOutletContext();
  const token = getAdminToken();
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
      setLoadError(err.message || 'Failed to load publish details.');
    } finally {
      setIsLoading(false);
    }
  }, [token, testId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handlePublished = useCallback(async () => {
    await loadDetails();
    if (typeof refreshTest === 'function') {
      await refreshTest();
    }
  }, [loadDetails, refreshTest]);

  const published = Boolean(test && isTestPublishedStatus(test.status));
  const readOnly = layoutReadOnly || published;

  const handleResultsReleasedChange = useCallback(
    (nextReleasedAt) => {
      setSettings((prev) => ({ ...(prev || {}), results_released_at: nextReleasedAt }));
      if (typeof refreshTest === 'function') {
        refreshTest();
      }
    },
    [refreshTest]
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <h2 className="heading-4" style={{ margin: 0, flex: '1 1 auto' }}>
          Publish
        </h2>
        {testId ? <DownloadResultsButton testId={testId} /> : null}
        {published ? (
          <Link className="btn btn--ghost btn--sm" to={adminRoute(`tests/${testId}/settings`)}>
            Edit settings
          </Link>
        ) : null}
      </div>

      {isLoading ? (
        <p className="body-md admin-courses__muted">Loading…</p>
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
          onPublished={handlePublished}
          publishSummary={completeness?.publish_summary}
          summaryLoading={isLoading}
          readOnly={readOnly}
          onResultsReleasedChange={handleResultsReleasedChange}
        />
      )}
    </div>
  );
}
