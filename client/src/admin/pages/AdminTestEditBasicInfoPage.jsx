import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import BasicInfoForm from '../components/BasicInfoForm';
import TestEditLayout from '../components/TestEditLayout';
import { useTestBasicInfoForm } from '../hooks/useTestBasicInfoForm';
import { mapTestToBasicInfoForm } from '../utils/testBasicInfoValidation';

function EditBasicInfoForm({ testId, initialForm, readOnly, onSaved }) {
  const token = getAdminToken();
  const formState = useTestBasicInfoForm(token, { initialForm, applyCreateDefaults: false });

  const {
    courses,
    form,
    fieldErrors,
    error,
    setError,
    success,
    setSuccess,
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
  } = formState;

  async function onSubmit(event) {
    event.preventDefault();
    if (readOnly) return;

    const payload = validateForSubmit();
    if (!payload) return;

    setIsSubmitting(true);
    try {
      await adminApi.patchTestBasicInfo(token, testId, payload);
      setSuccess('Test updated successfully');
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Failed to update test.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BasicInfoForm
      form={form}
      fieldErrors={fieldErrors}
      error={error}
      success={success}
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
      onSubmit={onSubmit}
      submitLabel="Save Changes"
    />
  );
}

export default function AdminTestEditBasicInfoPage() {
  const token = getAdminToken();
  const { testId } = useParams();
  const [isLoadingTest, setIsLoadingTest] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [initialForm, setInitialForm] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingTest(true);
    setLoadError('');
    setInitialForm(null);

    adminApi
      .getTest(token, testId)
      .then((response) => {
        if (cancelled) return;
        const test = response?.data;
        if (!test) {
          setLoadError('Test not found.');
          return;
        }
        setInitialForm(mapTestToBasicInfoForm(test));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load test.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTest(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, testId]);

  return (
    <TestEditLayout testId={testId} activeStep="basic-info" stepLabel="Step 1 — Basic info">
      {({ readOnly, reloadCompleteness }) =>
        isLoadingTest ? (
          <p className="body-md admin-courses__muted">Loading test…</p>
        ) : loadError ? (
          <p className="admin-error">{loadError}</p>
        ) : initialForm ? (
          <EditBasicInfoForm
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
