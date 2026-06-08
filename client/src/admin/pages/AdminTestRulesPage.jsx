import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import RulesForm from '../components/RulesForm';
import TestWizardNav, { getTestWizardPreviousStep } from '../components/TestWizardNav';
import { testPageHeading, useTestTitle } from '../hooks/useTestTitle';
import { TestWizardProgress } from '../components/TestWizardProgress';
import { useTestCompleteness } from '../hooks/useTestCompleteness';
import { defaultTestRulesForm, mapTestRulesToForm, validateTestRulesForm } from '../utils/testRulesValidation';

export default function AdminTestRulesPage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const { testId } = useParams();
  const testTitle = useTestTitle(testId);
  const { completeness, reload: reloadCompleteness } = useTestCompleteness(testId);
  const [form, setForm] = useState(defaultTestRulesForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRules() {
      setIsLoading(true);
      setError('');
      try {
        const response = await adminApi.getTestRules(token, testId);
        if (cancelled) return;
        setForm(mapTestRulesToForm(response?.data || {}));
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load test rules.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadRules();
    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSuccess('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validation = validateTestRulesForm(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await adminApi.patchTestRules(token, testId, validation.payload);
      await reloadCompleteness();
      setSuccess('Rules saved.');
      navigate(`/admin/tests/${testId}/settings`);
    } catch (err) {
      setError(err.message || 'Failed to save rules.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const previousStep = getTestWizardPreviousStep('rules', testId);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader
          title={testPageHeading(testTitle, testId)}
          previousTo={previousStep?.to}
          previousLabel={previousStep?.label}
        />
        <p className="admin-test-step-label">Step 2 — Rules & scoring</p>

        <TestWizardNav testId={testId} activeStep="rules" />

        <TestWizardProgress completeness={completeness} />
        {!completeness.step1_complete ? (
          <p className="admin-error" style={{ marginTop: '0.75rem' }}>
            Complete Step 1 (Basic Info) before saving rules.
          </p>
        ) : null}

        {isLoading ? (
          <p className="body-md admin-courses__muted">Loading rules…</p>
        ) : (
          <RulesForm
            form={form}
            fieldErrors={fieldErrors}
            error={error}
            success={success}
            isSubmitting={isSubmitting}
            submitDisabled={!completeness.step1_complete}
            onChange={onChange}
            onSubmit={onSubmit}
          />
        )}
      </section>
    </section>
  );
}
