import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import BasicInfoForm from '../components/BasicInfoForm';
import { useTestBasicInfoForm } from '../hooks/useTestBasicInfoForm';

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

  async function onSubmit(event) {
    event.preventDefault();
    const payload = validateForSubmit();
    if (!payload) return;

    setIsSubmitting(true);
    try {
      const response = await adminApi.createTest(token, payload);
      const testId = response?.data?.testId;
      if (!testId) {
        throw new Error('Test was created but no test id was returned.');
      }
      toast.success('Test created successfully');
      navigate(`/admin/tests/${testId}/rules`);
    } catch (err) {
      const message = err.message || 'Failed to create test.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader title="Create test" />
        <p className="admin-test-step-label">Step 1 — Basic info</p>

        <BasicInfoForm
          form={form}
          fieldErrors={fieldErrors}
          error={error}
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
          onSubmit={onSubmit}
          submitLabel="Save & continue to rules"
        />
      </section>
    </section>
  );
}
