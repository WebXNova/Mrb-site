import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import TestDetailsView from '../components/TestDetailsView';
import TestWizardNav from '../components/TestWizardNav';

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

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    Promise.all([
      adminApi.getTest(token, testId),
      adminApi.getTestRules(token, testId),
      adminApi.getTestSettings(token, testId),
      adminApi.getTestCompleteness(token, testId),
      adminApi.testQuestions(token, testId),
      adminApi.courses(token),
    ])
      .then(([testRes, rulesRes, settingsRes, completenessRes, questionsRes, coursesRes]) => {
        if (cancelled) return;
        const testData = testRes?.data;
        if (!testData) {
          setLoadError('Test not found.');
          return;
        }
        setTest(testData);
        setRules(rulesRes?.data || {});
        setSettings(settingsRes?.data || {});
        setCompleteness(completenessRes?.data || null);
        const questions = questionsRes?.data?.questions;
        setQuestionCount(Array.isArray(questions) ? questions.length : 0);

        const courses = Array.isArray(coursesRes?.data) ? coursesRes.data : [];
        const course = courses.find((row) => Number(row.id) === Number(testData.courseId));
        setCourseTitle(course?.title || (testData.courseId ? `Course #${testData.courseId}` : '—'));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load test details.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  const pageTitle = test?.title?.trim() || (isLoading ? 'Loading…' : `Test #${testId}`);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader title={pageTitle}>
          <Link className="btn btn--secondary" to={`/admin/tests/${testId}/edit/basic-info`}>
            Edit
          </Link>
        </AdminTestPageHeader>

        <p className="admin-test-step-label">Read-only details</p>

        <TestWizardNav testId={testId} activeStep="details" />

        {isLoading ? (
          <p className="body-md admin-courses__muted">Loading test details…</p>
        ) : loadError ? (
          <p className="admin-error">{loadError}</p>
        ) : (
          <TestDetailsView
            test={test}
            rules={rules}
            settings={settings}
            completeness={completeness}
            courseTitle={courseTitle}
            questionCount={questionCount}
          />
        )}
      </section>
    </section>
  );
}
