import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import SettingsForm from '../components/SettingsForm';
import TestEditLayout from '../components/TestEditLayout';
import {
  defaultTestSettingsForm,
  mapTestSettingsToForm,
  validateTestSettingsForm,
} from '../utils/testSettingsValidation';

function EditSettingsForm({ testId, initialForm, readOnly, onSaved }) {
  const token = getAdminToken();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function onCheckboxChange(event) {
    const { name, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: checked }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSuccess('');
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
    setSuccess('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (readOnly) return;

    setError('');
    setSuccess('');
    const validation = validateTestSettingsForm(form);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await adminApi.patchTestSettings(token, testId, validation.payload);
      setSuccess('Settings updated successfully');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to update settings.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SettingsForm
      form={form}
      fieldErrors={fieldErrors}
      error={error}
      success={success}
      isSubmitting={isSubmitting}
      readOnly={readOnly}
      onChange={onChange}
      onCheckboxChange={onCheckboxChange}
      onSubmit={onSubmit}
      submitLabel="Save Changes"
    />
  );
}

export default function AdminTestEditSettingsPage() {
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
      .getTestSettings(token, testId)
      .then((response) => {
        if (cancelled) return;
        setInitialForm(mapTestSettingsToForm(response?.data || {}));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load settings.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  return (
    <TestEditLayout testId={testId} activeStep="settings" stepLabel="Step 3 — Settings">
      {({ readOnly, reloadCompleteness }) =>
        isLoading ? (
          <p className="body-md admin-courses__muted">Loading settings…</p>
        ) : loadError ? (
          <p className="admin-error">{loadError}</p>
        ) : initialForm ? (
          <EditSettingsForm
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
