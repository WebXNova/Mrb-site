import { Link } from 'react-router-dom';
import PremiumFormField from '../courses/PremiumFormField';
import AdminLoadingButton from '../AdminLoadingButton';
import TeacherPasswordField from './TeacherPasswordField';
import TeacherStatusField from './TeacherStatusField';
import TeacherSubjectAssignmentField from './TeacherSubjectAssignmentField';

export default function TeacherForm({
  mode = 'create',
  form,
  fieldErrors,
  formError,
  subjects,
  subjectsLoading,
  subjectsLoadError,
  isSubmitting,
  isFormDisabled = false,
  onChange,
  onToggleSubject,
  onSubmit,
  onCancelTo,
}) {
  const isCreate = mode === 'create';

  const isDisabled = isFormDisabled || isSubmitting;

  return (
    <form className="admin-teacher-form" onSubmit={onSubmit} noValidate aria-busy={isSubmitting || undefined}>
      {formError ? (
        <p className="admin-error" role="alert">
          {formError}
        </p>
      ) : null}
      {subjectsLoadError ? (
        <p className="admin-error" role="alert">
          {subjectsLoadError}
        </p>
      ) : null}

      <section className="admin-teacher-form__section" aria-labelledby="teacher-basic-info-heading">
        <h2 id="teacher-basic-info-heading" className="admin-teacher-form__section-title">
          Basic information
        </h2>
        <div className="admin-form-grid">
          <PremiumFormField
            id="teacher-full-name"
            label="Full name"
            required
            error={fieldErrors.fullName}
          >
            <input
              id="teacher-full-name"
              className="premium-field__input"
              value={form.fullName}
              onChange={(e) => onChange('fullName', e.target.value)}
              autoComplete="name"
              disabled={isDisabled}
            />
          </PremiumFormField>

          <PremiumFormField
            id="teacher-email"
            label="Email address"
            required
            error={fieldErrors.email}
          >
            <input
              id="teacher-email"
              className="premium-field__input"
              type="email"
              value={form.email}
              onChange={(e) => onChange('email', e.target.value)}
              autoComplete="email"
              disabled={isDisabled}
            />
          </PremiumFormField>

          <PremiumFormField
            id="teacher-username"
            label="Username"
            required
            error={fieldErrors.username}
            hint="Lowercase letters, numbers, dots, and underscores only."
          >
            <input
              id="teacher-username"
              className="premium-field__input"
              value={form.username}
              onChange={(e) => onChange('username', e.target.value.toLowerCase())}
              autoComplete="username"
              disabled={isDisabled}
            />
          </PremiumFormField>

          {isCreate ? (
            <TeacherPasswordField
              required
              value={form.password}
              onChange={(e) => onChange('password', e.target.value)}
              error={fieldErrors.password}
              disabled={isDisabled}
            />
          ) : (
            <div className="admin-teacher-form__password-reset">
              <h3 className="admin-teacher-form__subsection-title">Password reset</h3>
              <p className="admin-teacher-form__password-note">
                Leave blank to keep the current password. Passwords are never shown after creation.
              </p>
              <TeacherPasswordField
                id="teacher-new-password"
                label="New password"
                required={false}
                value={form.password}
                onChange={(e) => onChange('password', e.target.value)}
                error={fieldErrors.password}
                disabled={isDisabled}
              />
            </div>
          )}
        </div>
      </section>

      <section className="admin-teacher-form__section" aria-labelledby="teacher-status-heading">
        <h2 id="teacher-status-heading" className="admin-teacher-form__section-title">
          Status
        </h2>
        <TeacherStatusField
          value={form.status}
          onChange={(status) => onChange('status', status)}
          error={fieldErrors.status}
          idPrefix={isCreate ? 'create-teacher-status' : 'edit-teacher-status'}
          disabled={isDisabled}
        />
      </section>

      <section className="admin-teacher-form__section" aria-labelledby="teacher-subjects-heading">
        <TeacherSubjectAssignmentField
          subjects={subjects}
          selectedIds={form.assignedSubjects}
          onToggle={onToggleSubject}
          error={fieldErrors.assignedSubjects}
          isLoading={subjectsLoading}
          loadError={subjectsLoadError}
          disabled={isDisabled}
        />
      </section>

      <div className="admin-teacher-form__actions">
        <Link className="btn--course-secondary admin-touch-target" to={onCancelTo}>
          Cancel
        </Link>
        <AdminLoadingButton
          type="submit"
          className="btn--course-primary admin-touch-target"
          isLoading={isSubmitting}
          loadingLabel={isCreate ? 'Creating…' : 'Updating…'}
          disabled={isFormDisabled || subjectsLoading}
        >
          {isCreate ? 'Create teacher' : 'Update teacher'}
        </AdminLoadingButton>
      </div>
    </form>
  );
}
