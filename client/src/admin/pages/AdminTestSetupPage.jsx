import { useEffect, useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import BasicInfoForm from '../components/BasicInfoForm';
import RulesForm from '../components/RulesForm';
import SettingsForm from '../components/SettingsForm';
import TestSetupLayout from '../components/TestSetupLayout';
import { useTestCompleteness } from '../hooks/useTestCompleteness';
import { TEST_WIZARD_BUTTONS } from '../config/testWizardConfig';
import { useTestBasicInfoForm } from '../hooks/useTestBasicInfoForm';
import { mapTestToBasicInfoForm } from '../utils/testBasicInfoValidation';
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

function UnifiedTestSetupForm({
  testId,
  initialBasicForm,
  initialRulesForm,
  initialSettingsForm,
  readOnly,
  onSaved,
  totalMarks = null,
}) {
  const token = getAdminToken();
  const basicState = useTestBasicInfoForm(token, { initialForm: initialBasicForm, applyCreateDefaults: false });

  const [rulesForm, setRulesForm] = useState(initialRulesForm);
  const [settingsForm, setSettingsForm] = useState(initialSettingsForm);
  const [rulesFieldErrors, setRulesFieldErrors] = useState({});
  const [settingsFieldErrors, setSettingsFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (readOnly) return;

    setError('');
    setBasicError('');
    setSuccess('');

    const basicPayload = validateForSubmit();
    const rulesValidation = validateTestRulesForm(rulesForm, { totalMarks });
    const settingsValidation = validateTestSettingsForm(settingsForm);

    let hasErrors = false;

    if (!basicPayload) {
      hasErrors = true;
    }

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
      await adminApi.patchTestBasicInfo(token, testId, basicPayload);
      await adminApi.patchTestRules(token, testId, rulesValidation.payload);
      await adminApi.patchTestSettings(token, testId, settingsValidation.payload);
      setSuccess('Test saved');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to save test.');
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
        Set title, course, rules, and access in one place. Defaults are applied when you create a test — adjust
        only if you need to.
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
        readOnly={readOnly}
        onChange={onChange}
        onToggleMixedSubject={onToggleMixedSubject}
      />

      <RulesForm
        embedded
        form={rulesForm}
        fieldErrors={rulesFieldErrors}
        totalMarks={totalMarks}
        isSubmitting={isSubmitting}
        readOnly={readOnly}
        onChange={onRulesChange}
      />

      <SettingsForm
        embedded
        form={settingsForm}
        fieldErrors={settingsFieldErrors}
        isSubmitting={isSubmitting}
        readOnly={readOnly}
        onChange={onSettingsChange}
        onCheckboxChange={onSettingsCheckboxChange}
      />

      {error ? <p className="admin-error">{error}</p> : null}
      {success ? <p className="admin-success">{success}</p> : null}

      {!readOnly ? (
        <div className="admin-test-form__footer admin-test-form__footer--unified">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={isSubmitting || !canSubmit}
            title={!canSubmit ? 'Complete all required fields and select valid course subjects' : undefined}
          >
            {isSubmitting ? 'Saving…' : TEST_WIZARD_BUTTONS.save}
          </button>
          <Link className="btn btn--secondary" to={adminRoute(`tests/${testId}/questions`)}>
            {TEST_WIZARD_BUTTONS.continueToQuestions}
          </Link>
        </div>
      ) : null}
    </form>
  );
}

export default function AdminTestSetupPage() {
  const token = getAdminToken();
  const { testId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [initialBasicForm, setInitialBasicForm] = useState(null);
  const [initialRulesForm, setInitialRulesForm] = useState(defaultTestRulesForm);
  const [initialSettingsForm, setInitialSettingsForm] = useState(defaultTestSettingsForm);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');

    Promise.all([
      adminApi.getTest(token, testId),
      adminApi.getTestRules(token, testId),
      adminApi.getTestSettings(token, testId),
    ])
      .then(([testRes, rulesRes, settingsRes]) => {
        if (cancelled) return;
        const test = testRes?.data;
        if (!test) {
          setLoadError('Test not found.');
          return;
        }
        setInitialBasicForm(mapTestToBasicInfoForm(test));
        setInitialRulesForm(mapTestRulesToForm(rulesRes?.data || {}));
        setInitialSettingsForm(mapTestSettingsToForm(settingsRes?.data || {}));
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
  }, [token, testId]);

  return (
    <TestSetupLayout testId={testId}>
      {({ readOnly, reloadCompleteness, completeness }) =>
        isLoading ? (
          <p className="body-md admin-courses__muted">Loading test setup…</p>
        ) : loadError ? (
          <p className="admin-error">{loadError}</p>
        ) : initialBasicForm ? (
          <UnifiedTestSetupForm
            key={testId}
            testId={testId}
            initialBasicForm={initialBasicForm}
            initialRulesForm={initialRulesForm}
            initialSettingsForm={initialSettingsForm}
            readOnly={readOnly}
            onSaved={reloadCompleteness}
            totalMarks={completeness?.publish_summary?.total_marks ?? null}
          />
        ) : null
      }
    </TestSetupLayout>
  );
}
