import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import SeatInventoryMeter from '../components/SeatInventoryMeter';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import {
  formatResultsReleaseLabel,
  formatScheduleWindow,
  getAccessModeOptionCopy,
  getResultsReleaseState,
  getTestAvailabilityState,
} from '../utils/testAdminDisplay.js';

function buildTasks(questionCount, test) {
  const hasQuestions = Number(questionCount) > 0;
  const standalone = isStandaloneAccessType(test?.testAccessType ?? test?.test_access_type);
  const paid = String(test?.testAccessType ?? test?.test_access_type) === 'paid_standalone';
  return [
    {
      key: 'settings',
      path: (id) => adminRoute(`tests/${id}/settings`),
      title: standalone ? 'Settings, schedule, and seats' : 'Adjust settings',
      description: standalone
        ? paid
          ? 'Set price, seat capacity, availability window, timer, and what students see after submit.'
          : 'Set the availability window, optional seat limit, timer, and what students see after submit.'
        : 'Change the test name, introduction, question display, review options, and access rules.',
    },
    {
      key: 'questions',
      path: (id) => adminRoute(`tests/${id}/questions`),
      title: hasQuestions ? 'Edit questions' : 'Add questions',
      description: hasQuestions
        ? 'Update, reorder, or import questions. Changes apply to future attempts.'
        : 'Add questions manually or import an Aiken file before publishing.',
      complete: hasQuestions,
    },
    {
      key: 'publish',
      path: (id) => adminRoute(`tests/${id}/publish`),
      title: 'Publish & distribute',
      description: 'Review readiness, publish the test, and confirm access mode before students can start.',
    },
    {
      key: 'results',
      path: (id) => adminRoute(`tests/${id}/results`),
      title: 'View results',
      description: 'Review attempts and publish results to students when you are ready. No email is sent.',
    },
  ];
}

export default function AdminTestDashboardPage() {
  const { testId, test } = useOutletContext();
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

  const tasks = useMemo(() => buildTasks(questionCount, test), [questionCount, test]);
  const standalone = isStandaloneAccessType(test?.testAccessType ?? test?.test_access_type);
  const paid = String(test?.testAccessType ?? test?.test_access_type) === 'paid_standalone';
  const resultsLabel = formatResultsReleaseLabel(getResultsReleaseState(test));
  const scheduleLabel = formatScheduleWindow(test);
  const availabilityState = getTestAvailabilityState(test);
  const accessMode = String(test?.accessMode ?? test?.access_mode ?? 'private').toLowerCase();
  const examOpenCopy = getAccessModeOptionCopy(
    test?.testAccessType ?? test?.test_access_type,
    accessMode
  );

  const handleClone = useCallback(async () => {
    if (!testId || utilitiesBusy) return;
    setUtilitiesBusy('clone');
    try {
      const response = await adminApi.duplicateTest(token, testId);
      const newId = response?.data?.id ?? response?.data?.testId;
      toast.success(
        test?.testAccessType === 'paid_standalone'
          ? 'Test cloned as a draft copy. Set price and seat capacity on the new test.'
          : 'Test cloned as a draft copy.'
      );
      if (newId) {
        navigate(adminRoute(`tests/${newId}/dashboard`));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to clone test.');
    } finally {
      setUtilitiesBusy('');
    }
  }, [navigate, test?.testAccessType, testId, toast, token, utilitiesBusy]);

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
        Adjust settings, add questions, publish the test, and review results from this control panel.
        Published tests stay editable where the server allows it — already-started attempts keep their original exam.
      </p>

      {standalone ? (
        <section className="test-dashboard-availability" aria-labelledby="test-dashboard-availability-heading">
          <h2 id="test-dashboard-availability-heading" className="heading-5 test-dashboard__section-title">
            Availability
          </h2>
          <p className="test-dashboard-availability__schedule">{scheduleLabel || 'Schedule not set'}</p>
          <p className="test-dashboard-availability__hint">
            {availabilityState === 'closed' || accessMode !== 'public'
              ? examOpenCopy.hint
              : examOpenCopy.label}
            {' '}
            <Link to={adminRoute(`tests/${testId}/settings`)}>Open or close the exam in Settings</Link>
            {' '}
            (Access mode). Publish is separate from opening the exam.
          </p>
          <SeatInventoryMeter test={test} />
          {paid ? (
            <p className="test-dashboard-availability__hint">
              <Link to={`${adminRoute('standalone-test-payments')}?testId=${testId}`}>
                Review paid registrations and payment proofs
              </Link>
              . Approving a payment confirms a seat — it does not open the exam.
            </p>
          ) : (
            <p className="test-dashboard-availability__hint">
              Set the start and end window in Settings. Students can start only while the test is published, open, and inside that window.
            </p>
          )}
          {resultsLabel ? (
            <p className="test-dashboard-availability__hint">
              {resultsLabel}. Manage release from{' '}
              <Link to={adminRoute(`tests/${testId}/results`)}>Results</Link>.
            </p>
          ) : null}
        </section>
      ) : null}

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
                {test?.testAccessType === 'paid_standalone'
                  ? ' Price and seat capacity are not copied.'
                  : ''}
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
