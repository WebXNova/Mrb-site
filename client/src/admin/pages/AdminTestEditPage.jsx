import { useEffect, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import BasicInfoForm from '../components/BasicInfoForm';
import RulesForm from '../components/RulesForm';
import SettingsForm from '../components/SettingsForm';
import PublishedTestEditBanner from '../components/PublishedTestEditBanner';
import { TEST_WIZARD_BUTTONS } from '../config/testWizardConfig';
import { useTestBasicInfoForm } from '../hooks/useTestBasicInfoForm';
import { isTestPublishedStatus, mapTestToBasicInfoForm } from '../utils/testBasicInfoValidation';
import {
  defaultTestRulesForm,
  mapTestRulesToForm,
  validateTestRulesForm,
} from '../utils/testRulesValidation';
import {
  defaultTestSettingsForm,
  mapTestSettingsToForm,
  validateTestSettingsForm,
} from '../utils/testSettingsValidation';
import {
  confirmPublishedTestEdit,
  withPublishedEditControls,
} from '../utils/publishedTestEdit';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import TestWizardNav from '../components/TestWizardNav';
import { testPageHeading } from '../hooks/useTestTitle';

function PublishedTestEditForm({
  testId,
  testTitle,
  testUpdatedAt,
  initialBasicForm,
  initialRulesForm,
  initialSettingsForm,
  onSaved,
  totalMarks = null,
}) {
  const token = getAdminToken();
  const navigate = useNavigate();
  const basicState = useTestBasicInfoForm(token, { initialForm: initialBasicForm, applyCreateDefaults: false });

  const [rulesForm, setRulesForm] = useState(initialRulesForm);
  const [settingsForm, setSettingsForm] = useState(initialSettingsForm);
  const [rulesFieldErrors, setRulesFieldErrors] = useState({});
  const [settingsFieldErrors, setSettingsFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(testUpdatedAt);

  const {
    courses,
    form,
    fieldErrors,
    setError: setBasicError,
    createOptions,
    subjects,
    isLoadingOptions,
    optionsError,
    isLoadingSubjects,
    subjectsError,
    canSubmit,
    onChange,
    onToggleMixedSubject,
    validateForSubmit,
  } = basicState;

  function onRulesChange(event) {
    const { name, value } = event.target;
    setRulesForm((prev) => ({ ...prev, [name]: value }));
    setRulesFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSuccess('');
  }

  function onSettingsChange(event) {
    const { name, value } = event.target;
    setSettingsForm((prev) => ({ ...prev, [name]: value }));
    setSettingsFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSuccess('');
  }

  function onSettingsCheckboxChange(event) {
    const { name, checked } = event.target;
    setSettingsForm((prev) => ({ ...prev, [name]: checked }));
    setSuccess('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBasicError('');
    setSuccess('');

    if (!confirmPublishedTestEdit({ title: testTitle, status: 'published' })) {
      return;
    }

    const basicPayload = validateForSubmit();
    const rulesValidation = validateTestRulesForm(rulesForm, { totalMarks });
    const settingsValidation = validateTestSettingsForm(settingsForm);

    let hasErrors = false;
    if (!basicPayload) hasErrors = true;
    if (!rulesValidation.ok) {
      setRulesFieldErrors(rulesValidation.errors);
      hasErrors = true;
    } else {
      setRulesFieldErrors({});
    }
    if (!settingsValidation.ok) {
      setSettingsFieldErrors(settingsValidation.errors);
      hasErrors = true;
    } else {
      setSettingsFieldErrors({});
    }
    if (hasErrors || !basicPayload) return;

    setIsSubmitting(true);
    try {
      let expectedUpdatedAt = updatedAt;

      await adminApi.patchTestBasicInfo(
        token,
        testId,
        withPublishedEditControls(basicPayload, {
          confirmPublishedEdit: true,
          expectedUpdatedAt,
        })
      );

      const refreshed1 = await adminApi.getTest(token, testId).catch(() => null);
      expectedUpdatedAt = refreshed1?.data?.updatedAt ?? expectedUpdatedAt;

      await adminApi.patchTestRules(
        token,
        testId,
        withPublishedEditControls(rulesValidation.payload, {
          confirmPublishedEdit: true,
          expectedUpdatedAt,
        })
      );

      const refreshed2 = await adminApi.getTest(token, testId).catch(() => null);
      expectedUpdatedAt = refreshed2?.data?.updatedAt ?? expectedUpdatedAt;

      const settingsResult = await adminApi.patchTestSettings(
        token,
        testId,
        withPublishedEditControls(settingsValidation.payload, {
          confirmPublishedEdit: true,
          expectedUpdatedAt,
        })
      );

      const refreshed = await adminApi.getTest(token, testId);
      const nextUpdatedAt = refreshed?.data?.updatedAt ?? expectedUpdatedAt;
      setUpdatedAt(nextUpdatedAt);
      setSuccess('Published test updated successfully.');
      onSaved?.(settingsResult?.data);
      window.setTimeout(() => navigate(adminRoute('tests')), 1200);
    } catch (err) {
      setError(err.message || 'Failed to save published test.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingOptions) {
    return <p className="body-md admin-courses__muted">Loading test setup…</p>;
  }

  if (optionsError) {
    return <p className="admin-error">{optionsError}</p>;
  }

  return (
    <form className="admin-test-form admin-test-form--unified" onSubmit={onSubmit} noValidate>
      <p className="admin-test-form__intro">
        Update title, course, rules, and access. The test stays published — only content and settings change.
      </p>

      <BasicInfoForm
        embedded
        form={form}
        fieldErrors={fieldErrors}
        courses={courses}
        createOptions={createOptions}
        subjects={subjects}
        isLoadingOptions={isLoadingOptions}
        optionsError={optionsError}
        isLoadingSubjects={isLoadingSubjects}
        subjectsError={subjectsError}
        isSubmitting={isSubmitting}
        canSubmit={canSubmit}
        readOnly={false}
        onChange={onChange}
        onToggleMixedSubject={onToggleMixedSubject}
      />

      <RulesForm
        embedded
        form={rulesForm}
        fieldErrors={rulesFieldErrors}
        totalMarks={totalMarks}
        isSubmitting={isSubmitting}
        readOnly={false}
        onChange={onRulesChange}
      />

      <SettingsForm
        embedded
        form={settingsForm}
        fieldErrors={settingsFieldErrors}
        isSubmitting={isSubmitting}
        readOnly={false}
        onChange={onSettingsChange}
        onCheckboxChange={onSettingsCheckboxChange}
      />

      {error ? <p className="admin-error">{error}</p> : null}
      {success ? <p className="admin-success">{success}</p> : null}

      <div className="admin-test-form__footer admin-test-form__footer--unified">
        <button
          className="btn btn--primary"
          type="submit"
          disabled={isSubmitting || !canSubmit}
          title={!canSubmit ? 'Complete all required fields and select valid course subjects' : undefined}
        >
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
        <Link className="btn btn--secondary" to={adminRoute(`tests/${testId}/edit/questions`)}>
          {TEST_WIZARD_BUTTONS.continueToQuestions}
        </Link>
        <Link className="btn btn--ghost" to={adminRoute('tests')}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export default function AdminTestEditPage() {
  const token = getAdminToken();
  const { testId } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [testTitle, setTestTitle] = useState('');
  const [testUpdatedAt, setTestUpdatedAt] = useState('');
  const [initialBasicForm, setInitialBasicForm] = useState(null);
  const [initialRulesForm, setInitialRulesForm] = useState(defaultTestRulesForm);
  const [initialSettingsForm, setInitialSettingsForm] = useState(defaultTestSettingsForm);
  const [totalMarks, setTotalMarks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    Promise.all([
      adminApi.getTest(token, testId),
      adminApi.getTestRules(token, testId),
      adminApi.getTestSettings(token, testId),
      adminApi.getTestCompleteness(token, testId),
    ])
      .then(([testRes, rulesRes, settingsRes, completenessRes]) => {
        if (cancelled) return;
        const test = testRes?.data;
        if (!test) {
          setLoadError('Test not found.');
          return;
        }
        if (!isTestPublishedStatus(test.status)) {
          navigate(adminRoute(`tests/${testId}/setup`), { replace: true });
          return;
        }
        setTestTitle(test.title ?? '');
        setTestUpdatedAt(test.updatedAt ?? '');
        setInitialBasicForm(mapTestToBasicInfoForm(test));
        setInitialRulesForm(mapTestRulesToForm(rulesRes?.data || {}));
        setInitialSettingsForm(mapTestSettingsToForm(settingsRes?.data || {}));
        setTotalMarks(completenessRes?.data?.publish_summary?.total_marks ?? null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load test.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, token, testId]);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader
          title={testPageHeading(testTitle, testId)}
          backLabel={TEST_WIZARD_BUTTONS.backToTests}
        />

        <p className="admin-test-step-label">Edit published test — Setup</p>

        <TestWizardNav testId={testId} activeStep="setup" editMode />

        <PublishedTestEditBanner testTitle={testTitle} />

        {loadError ? <p className="admin-error">{loadError}</p> : null}

        <div className="admin-test-edit-body">
          {isLoading ? (
            <p className="body-md admin-courses__muted">Loading test…</p>
          ) : initialBasicForm ? (
            <PublishedTestEditForm
              key={testId}
              testId={testId}
              testTitle={testTitle}
              testUpdatedAt={testUpdatedAt}
              initialBasicForm={initialBasicForm}
              initialRulesForm={initialRulesForm}
              initialSettingsForm={initialSettingsForm}
              totalMarks={totalMarks}
            />
          ) : null}
        </div>
      </section>
    </section>
  );
}
