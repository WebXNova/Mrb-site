import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import RulesForm from '../components/RulesForm';
import TestEditLayout from '../components/TestEditLayout';
import { mapTestRulesToForm, validateTestRulesForm } from '../utils/testRulesValidation';

function EditRulesForm({ testId, initialForm, readOnly, onSaved }) {
  const token = getAdminToken();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (readOnly) return;

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
      setSuccess('Rules updated successfully');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to update rules.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <RulesForm
      form={form}
      fieldErrors={fieldErrors}
      error={error}
      success={success}
      isSubmitting={isSubmitting}
      readOnly={readOnly}
      onChange={onChange}
      onSubmit={onSubmit}
      submitLabel="Save Changes"
    />
  );
}

export default function AdminTestEditRulesPage() {
  const token = getAdminToken();
  const { testId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [initialForm, setInitialForm] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    setInitialForm(null);

    adminApi
      .getTestRules(token, testId)
      .then((response) => {
        if (cancelled) return;
        setInitialForm(mapTestRulesToForm(response?.data || {}));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load rules.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  return (
    <TestEditLayout testId={testId} activeStep="rules" stepLabel="Step 2 — Rules">
      {({ readOnly, reloadCompleteness }) =>
        isLoading ? (
          <p className="body-md admin-courses__muted">Loading rules…</p>
        ) : loadError ? (
          <p className="admin-error">{loadError}</p>
        ) : initialForm ? (
          <EditRulesForm
            key={testId}
            testId={testId}
            initialForm={initialForm}
            readOnly={readOnly}
            onSaved={reloadCompleteness}
          />
        ) : null
      }
    </TestEditLayout>
  );
}
