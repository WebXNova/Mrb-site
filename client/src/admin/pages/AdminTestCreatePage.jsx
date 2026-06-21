import { useState } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import {
  getWizardStepEyebrow,
  TEST_WIZARD_BUTTONS,
} from '../config/testWizardConfig';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import BasicInfoForm from '../components/BasicInfoForm';
import RulesForm from '../components/RulesForm';
import SettingsForm from '../components/SettingsForm';
import TestWizardPhaseStrip from '../components/TestWizardPhaseStrip';
import { useTestBasicInfoForm } from '../hooks/useTestBasicInfoForm';
import { defaultTestRulesForm, validateTestRulesForm } from '../utils/testRulesValidation';
import { defaultTestSettingsForm, validateTestSettingsForm } from '../utils/testSettingsValidation';

export default function AdminTestCreatePage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const toast = useAdminToast();

  const {
    courses,
    form,
    fieldErrors,
    error,
    setError,
    isSubmitting,
    setIsSubmitting,
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
  } = useTestBasicInfoForm(token, { applyCreateDefaults: true });

  const [rulesForm, setRulesForm] = useState(defaultTestRulesForm);
  const [settingsForm, setSettingsForm] = useState(defaultTestSettingsForm);
  const [rulesFieldErrors, setRulesFieldErrors] = useState({});
  const [settingsFieldErrors, setSettingsFieldErrors] = useState({});

  function onRulesChange(event) {
    const { name, value } = event.target;
    setRulesForm((prev) => ({ ...prev, [name]: value }));
    setRulesFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
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
  }

  function onSettingsCheckboxChange(event) {
    const { name, checked } = event.target;
    setSettingsForm((prev) => ({ ...prev, [name]: checked }));
  }

  async function onSubmit(event) {
    event.preventDefault();

    const basicPayload = validateForSubmit();
    const rulesValidation = validateTestRulesForm(rulesForm);
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
    setError('');
    try {
      const response = await adminApi.createTest(token, basicPayload);
      const testId = response?.data?.testId;
      if (!testId) {
        throw new Error('Test was created but no test id was returned.');
      }

      await adminApi.patchTestRules(token, testId, rulesValidation.payload);
      await adminApi.patchTestSettings(token, testId, settingsValidation.payload);

      toast.success('Test created — add your questions next.');
      navigate(adminRoute(`tests/${testId}/questions`));
    } catch (err) {
      const message = err.message || 'Failed to create test.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingOptions) {
    return (
      <section className="admin-page admin-page--tests">
        <section className="admin-card">
          <AdminTestPageHeader title="Create test" backLabel={TEST_WIZARD_BUTTONS.backToTests} />
          <p className="body-md admin-courses__muted">Loading test setup…</p>
        </section>
      </section>
    );
  }

  if (optionsError) {
    return (
      <section className="admin-page admin-page--tests">
        <section className="admin-card">
          <AdminTestPageHeader title="Create test" backLabel={TEST_WIZARD_BUTTONS.backToTests} />
          <p className="admin-error">{optionsError}</p>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader
          title="Create test"
          backLabel={TEST_WIZARD_BUTTONS.backToTests}
        />
        <p className="admin-test-step-label">{getWizardStepEyebrow('setup')}</p>
        <TestWizardPhaseStrip activePhase="setup" />

        <form className="admin-test-form admin-test-form--unified" onSubmit={onSubmit} noValidate>
          <p className="admin-test-form__intro">
            Set title, course, duration, rules, and access. Defaults are pre-filled — adjust only if you need to.
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
            onChange={onChange}
            onToggleMixedSubject={onToggleMixedSubject}
          />

          <RulesForm
            embedded
            form={rulesForm}
            fieldErrors={rulesFieldErrors}
            isSubmitting={isSubmitting}
            onChange={onRulesChange}
          />

          <SettingsForm
            embedded
            form={settingsForm}
            fieldErrors={settingsFieldErrors}
            isSubmitting={isSubmitting}
            onChange={onSettingsChange}
            onCheckboxChange={onSettingsCheckboxChange}
          />

          {error ? <p className="admin-error">{error}</p> : null}

          <div className="admin-test-form__footer admin-test-form__footer--unified">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={isSubmitting || !canSubmit}
              title={!canSubmit ? 'Complete all required fields and select valid course subjects' : undefined}
            >
              {isSubmitting ? 'Creating…' : TEST_WIZARD_BUTTONS.saveAndAddQuestions}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
