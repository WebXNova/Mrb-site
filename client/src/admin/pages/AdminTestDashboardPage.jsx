import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';

function buildTasks(questionCount) {
  const hasQuestions = Number(questionCount) > 0;
  return [
    {
      key: 'settings',
      path: (id) => adminRoute(`tests/${id}/settings`),
      title: 'Adjust settings',
      description:
        'Change the test name, introduction, question display, review options, and access rules.',
    },
    {
      key: 'questions',
      path: (id) => adminRoute(`tests/${id}/questions`),
      title: hasQuestions ? 'Edit questions' : 'Add questions',
      description: hasQuestions
        ? 'Update or reorder the questions in this test.'
        : "It's not much of a test if it doesn't have questions.",
      complete: hasQuestions,
    },
    {
      key: 'publish',
      path: (id) => adminRoute(`tests/${id}/publish`),
      title: 'Publish & distribute',
      description: 'Review readiness, publish your test, and release results when ready.',
    },
    {
      key: 'results',
      path: (id) => adminRoute(`tests/${id}/results`),
      title: 'View results',
      description: 'See how well your students did on the test.',
    },
  ];
}

export default function AdminTestDashboardPage() {
  const { testId } = useOutletContext();
  const token = getAdminToken();
  const navigate = useNavigate();
  const toast = useAdminToast();

  const [questionCount, setQuestionCount] = useState(0);
  const [utilitiesBusy, setUtilitiesBusy] = useState('');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  useEffect(() => {
    if (!testId) return undefined;
    let cancelled = false;

    adminApi
      .getTestCompleteness(token, testId)
      .then((response) => {
        if (cancelled) return;
        setQuestionCount(Number(response?.data?.question_count ?? 0));
      })
      .catch(() => {
        if (!cancelled) setQuestionCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [testId, token]);

  const tasks = useMemo(() => buildTasks(questionCount), [questionCount]);

  const handleClone = useCallback(async () => {
    if (!testId || utilitiesBusy) return;
    setUtilitiesBusy('clone');
    try {
      const response = await adminApi.duplicateTest(token, testId);
      const newId = response?.data?.id ?? response?.data?.testId;
      toast.success('Test cloned as a draft copy.');
      if (newId) {
        navigate(adminRoute(`tests/${newId}/dashboard`));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to clone test.');
    } finally {
      setUtilitiesBusy('');
    }
  }, [navigate, testId, toast, token, utilitiesBusy]);

  const handleClearResults = useCallback(async () => {
    if (!testId || utilitiesBusy) return;
    setUtilitiesBusy('clear');
    try {
      const response = await adminApi.clearTestResults(token, testId);
      const deleted = Number(response?.data?.deletedAttempts ?? 0);
      toast.success(
        deleted === 0
          ? 'No attempt data to clear.'
          : `Cleared ${deleted} attempt${deleted === 1 ? '' : 's'} and associated results.`
      );
      setClearConfirmOpen(false);
    } catch (err) {
      toast.error(err.message || 'Failed to clear result data.');
    } finally {
      setUtilitiesBusy('');
    }
  }, [testId, toast, token, utilitiesBusy]);

  return (
    <div className="test-dashboard">
      <p className="admin-field__hint test-dashboard__intro">
        This is the control panel where you can adjust settings, add questions, publish the test, and
        view results.
      </p>

      <section className="test-dashboard__section" aria-labelledby="test-dashboard-tasks-heading">
        <h2 id="test-dashboard-tasks-heading" className="heading-5 test-dashboard__section-title">
          Tasks
        </h2>
        <ol className="test-dashboard-tasks">
          {tasks.map((task, index) => (
            <li key={task.key} className="test-dashboard-task">
              <span className="test-dashboard-task__number" aria-hidden="true">
                {index + 1}
              </span>
              <div className="test-dashboard-task__body">
                <Link className="test-dashboard-task__link" to={task.path(testId)}>
                  {task.title}
                  {task.complete ? (
                    <span className="test-dashboard-task__complete" aria-label="Complete" title="Questions added">
                      ✓
                    </span>
                  ) : null}
                </Link>
                <p className="test-dashboard-task__desc">{task.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="test-dashboard__section" aria-labelledby="test-dashboard-utilities-heading">
        <h2 id="test-dashboard-utilities-heading" className="heading-5 test-dashboard__section-title">
          Test utilities
        </h2>
        <ul className="test-dashboard-utilities">
          <li>
            <button
              type="button"
              className="test-dashboard-utilities__card"
              onClick={handleClone}
              disabled={Boolean(utilitiesBusy)}
            >
              <span className="test-dashboard-utilities__card-title">Clone</span>
              <span className="test-dashboard-utilities__card-desc">
                Create a draft copy with the same questions and settings.
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="test-dashboard-utilities__card test-dashboard-utilities__card--danger"
              onClick={() => setClearConfirmOpen(true)}
              disabled={Boolean(utilitiesBusy)}
            >
              <span className="test-dashboard-utilities__card-title">Clear result data</span>
              <span className="test-dashboard-utilities__card-desc">
                Permanently delete all student attempts and scores.
              </span>
            </button>
          </li>
        </ul>
      </section>

      <AdminConfirmDialog
        open={clearConfirmOpen}
        title="Clear all result data?"
        message="This permanently deletes every student attempt and score for this test. This cannot be undone."
        confirmLabel="Clear result data"
        cancelLabel="Cancel"
        danger
        busy={utilitiesBusy === 'clear'}
        onConfirm={handleClearResults}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
}
