/**
 * Shared Step 1 basic-info form for create and edit test flows.
 */
import PremiumCheckboxGroup from './ui/PremiumCheckboxGroup';
import PremiumRadioGroup from './ui/PremiumRadioGroup';
import { isStandaloneAccessType, TEST_ACCESS_TYPE_OPTIONS } from '../constants/testAccessType.js';

export default function BasicInfoForm({
  form,
  fieldErrors,
  error,
  success,
  courses,
  createOptions,
  subjects,
  isLoadingOptions,
  optionsError,
  isLoadingSubjects,
  subjectsError,
  isSubmitting,
  canSubmit,
  readOnly = false,
  onChange,
  onToggleMixedSubject,
  onSubmit,
  submitLabel = 'Save',
  embedded = false,
}) {
  const titleLen = String(form.title ?? '').trim().length;
  const descriptionLen = String(form.description ?? '').trim().length;
  const standalone = isStandaloneAccessType(form.test_access_type);
  const showCourseField = !standalone;
  const showSubjectSection = standalone || Boolean(form.course_id);
  const pageBlocked = isLoadingOptions || Boolean(optionsError);
  const disabled = isSubmitting || pageBlocked || readOnly;

  if (isLoadingOptions) {
    return <p className="body-md admin-courses__muted">Loading form options…</p>;
  }

  if (optionsError) {
    return <p className="admin-error">{optionsError}</p>;
  }

  const fields = (
    <>
      <h2 className="heading-4">General</h2>

      <PremiumRadioGroup
        legend="Test type"
        name="test_access_type"
        value={form.test_access_type}
        disabled={disabled}
        options={TEST_ACCESS_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          hint: option.description,
        }))}
        onChange={(value) => onChange({ target: { name: 'test_access_type', value } })}
      />
      {fieldErrors.test_access_type ? (
        <div className="admin-field__error">{fieldErrors.test_access_type}</div>
      ) : null}

      <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
        {showCourseField ? (
        <div className="admin-field">
          <label htmlFor="course_id">Course</label>
          <select
            id="course_id"
            name="course_id"
            value={form.course_id}
            onChange={onChange}
            required
            aria-invalid={Boolean(fieldErrors.course_id)}
            disabled={disabled}
          >
            <option value="">Select course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title || `Course #${course.id}`}
              </option>
            ))}
          </select>
          {fieldErrors.course_id ? <div className="admin-field__error">{fieldErrors.course_id}</div> : null}
        </div>
        ) : null}

        <div className="admin-field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            value={form.title}
            onChange={onChange}
            required
            maxLength={120}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.title)}
            disabled={disabled}
          />
          <div className="admin-field__hint">{titleLen} / 120 (minimum 3 characters)</div>
          {fieldErrors.title ? <div className="admin-field__error">{fieldErrors.title}</div> : null}
        </div>

        <div className="admin-field">
          <label htmlFor="test_type">Subject mix</label>
          <select
            id="test_type"
            name="test_type"
            value={form.test_type}
            onChange={onChange}
            required
            aria-invalid={Boolean(fieldErrors.test_type)}
            disabled={disabled || (!standalone && !form.course_id)}
          >
            {createOptions.testTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {fieldErrors.test_type ? <div className="admin-field__error">{fieldErrors.test_type}</div> : null}
        </div>
      </div>

      {showSubjectSection ? (
        <div className="admin-test-form__subjects">
          {isLoadingSubjects ? (
            <p className="body-md admin-courses__muted">
              {standalone ? 'Loading subjects…' : 'Loading subjects for this course…'}
            </p>
          ) : subjectsError ? (
            <p className="admin-error">{subjectsError}</p>
          ) : form.test_type === 'subject_wise' ? (
            <div className="admin-field">
              <label htmlFor="subject_id">Subject</label>
              <select
                id="subject_id"
                name="subject_id"
                value={form.subject_id}
                onChange={onChange}
                required
                disabled={disabled || !subjects.length}
                aria-invalid={Boolean(fieldErrors.subject_id)}
              >
                <option value="">
                  {subjects.length
                    ? 'Select one subject'
                    : standalone
                      ? 'No active subjects found'
                      : 'No subjects found for this course'}
                </option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title || subject.name || `Subject #${subject.id}`}
                  </option>
                ))}
              </select>
              {fieldErrors.subject_id ? <div className="admin-field__error">{fieldErrors.subject_id}</div> : null}
            </div>
          ) : (
            <div className="admin-field">
              <PremiumCheckboxGroup
                legend="Subjects"
                options={subjects.map((subject) => ({
                  value: Number(subject.id),
                  label: subject.title || subject.name || `Subject #${subject.id}`,
                }))}
                selectedValues={form.subject_ids}
                onChange={(nextIds) => {
                  subjects.forEach((s) => {
                    const id = Number(s.id);
                    const wasSelected = form.subject_ids.includes(id);
                    const isSelected = nextIds.includes(id);
                    if (wasSelected !== isSelected) onToggleMixedSubject(s.id);
                  });
                }}
                disabled={disabled}
                emptyMessage={
                  standalone ? 'No active subjects found.' : 'No subjects found for this course.'
                }
              />
              <p className="admin-field__hint">
                {standalone
                  ? 'Select one or more subjects for this test.'
                  : 'Select one or more subjects from the course.'}
              </p>
              {fieldErrors.subject_ids ? <div className="admin-field__error">{fieldErrors.subject_ids}</div> : null}
            </div>
          )}
        </div>
      ) : (
        <p className="admin-courses__muted" style={{ marginTop: 'var(--space-4)' }}>
          Select a course to load subjects.
        </p>
      )}

      <div className="admin-field admin-field--full" style={{ marginTop: 'var(--space-4)' }}>
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          value={form.description}
          onChange={onChange}
          rows={4}
          maxLength={500}
          placeholder="Optional test description"
          aria-invalid={Boolean(fieldErrors.description)}
          disabled={disabled}
        />
        <div className="admin-field__hint">{descriptionLen} / 500 characters</div>
        {fieldErrors.description ? <div className="admin-field__error">{fieldErrors.description}</div> : null}
      </div>

      {!embedded && error ? <p className="admin-error">{error}</p> : null}
      {!embedded && success ? <p className="admin-success">{success}</p> : null}

      {!embedded && !readOnly ? (
        <div className="admin-test-form__footer">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={isSubmitting || !canSubmit}
            title={!canSubmit ? 'Complete all required fields and select valid course subjects' : undefined}
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <section className="admin-test-form-section">{fields}</section>;
  }

  return (
    <form className="admin-test-form" onSubmit={readOnly ? (event) => event.preventDefault() : onSubmit} noValidate>
      {fields}
    </form>
  );
}
