import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import SettingsForm from '../components/SettingsForm';
import TestWizardNav, { getTestWizardPreviousStep } from '../components/TestWizardNav';
import { testPageHeading, useTestTitle } from '../hooks/useTestTitle';
import { TestWizardProgress } from '../components/TestWizardProgress';
import { useTestCompleteness } from '../hooks/useTestCompleteness';
import {
  defaultTestSettingsForm,
  mapTestSettingsToForm,
  validateTestSettingsForm,
} from '../utils/testSettingsValidation';

export default function AdminTestSettingsPage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const { testId } = useParams();
  const testTitle = useTestTitle(testId);
  const { completeness, reload: reloadCompleteness } = useTestCompleteness(testId);
  const [form, setForm] = useState(defaultTestSettingsForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      setError('');
      try {
        const response = await adminApi.getTestSettings(token, testId);
        if (cancelled) return;
        setForm(mapTestSettingsToForm(response?.data || {}));
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load test settings.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  function onCheckboxChange(event) {
    const { name, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: checked }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');

    const validation = validateTestSettingsForm(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await adminApi.patchTestSettings(token, testId, validation.payload);
      await reloadCompleteness();
      navigate(`/admin/tests/${testId}/questions`);
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const previousStep = getTestWizardPreviousStep('settings', testId);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader
          title={testPageHeading(testTitle, testId)}
          previousTo={previousStep?.to}
          previousLabel={previousStep?.label}
        />
        <p className="admin-test-step-label">Step 3 — Settings & access</p>

        <TestWizardNav testId={testId} activeStep="settings" />

        <TestWizardProgress completeness={completeness} />
        {!completeness.step2_complete ? (
          <p className="admin-error" style={{ marginTop: '0.75rem' }}>
            Complete Step 2 (Rules & Scoring) before saving settings.{' '}
            <Link to={`/admin/tests/${testId}/rules`}>Go to Rules</Link>
          </p>
        ) : null}

        {isLoading ? (
          <p className="body-md admin-courses__muted">Loading settings…</p>
        ) : (
          <SettingsForm
            form={form}
            fieldErrors={fieldErrors}
            error={error}
            isSubmitting={isSubmitting}
            submitDisabled={!completeness.step2_complete}
            onChange={onChange}
            onCheckboxChange={onCheckboxChange}
            onSubmit={onSubmit}
          />
        )}
      </section>
    </section>
  );
}
