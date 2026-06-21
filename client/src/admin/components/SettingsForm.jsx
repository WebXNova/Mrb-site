/**
 * Shared Step 3 settings & access form for wizard and edit flows.
 */
export default function SettingsForm({
  form,
  fieldErrors,
  error,
  success,
  isSubmitting,
  readOnly = false,
  submitDisabled = false,
  onChange,
  onCheckboxChange,
  onSubmit,
  submitLabel = 'Save',
  embedded = false,
}) {
  const disabled = isSubmitting || readOnly;

  const toggles = [
    { name: 'shuffle_questions', label: 'Shuffle questions' },
    { name: 'shuffle_options', label: 'Shuffle options' },
    { name: 'show_explanations', label: 'Show explanations' },
    { name: 'show_result_immediately', label: 'Show result immediately' },
    { name: 'show_answers_after_submit', label: 'Show answers after submit' },
    { name: 'allow_retake', label: 'Allow retake' },
  ];

  const fields = (
    <>
      <h2 className="heading-4">Exam behavior</h2>
      <div className="admin-settings-checkboxes">
        {toggles.map(({ name, label }) => (
          <label key={name}>
            <input
              type="checkbox"
              name={name}
              checked={form[name]}
              onChange={onCheckboxChange}
              disabled={disabled}
            />
            {label}
          </label>
        ))}
      </div>

      <h2 className="heading-4" style={{ marginTop: 'var(--space-6)' }}>
        Access control
      </h2>
      <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <div className="admin-field">
          <label htmlFor="access_mode">Access mode</label>
          <select
            id="access_mode"
            name="access_mode"
            value={form.access_mode}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.access_mode)}
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
          <p className="admin-field__hint">
            Public controls who may take this test after you publish it. Use the <strong>Publish test</strong>{' '}
            button (below when ready, or Tests list → More) to go live — saving Public here does not publish.
          </p>
          {fieldErrors.access_mode ? <div className="admin-field__error">{fieldErrors.access_mode}</div> : null}
        </div>

        <div className="admin-field">
          <label htmlFor="start_date">Start date</label>
          <input
            id="start_date"
            name="start_date"
            type="datetime-local"
            value={form.start_date}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.start_date)}
          />
          {fieldErrors.start_date ? <div className="admin-field__error">{fieldErrors.start_date}</div> : null}
        </div>

        <div className="admin-field">
          <label htmlFor="end_date">End date</label>
          <input
            id="end_date"
            name="end_date"
            type="datetime-local"
            value={form.end_date}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.end_date)}
          />
          {fieldErrors.end_date ? <div className="admin-field__error">{fieldErrors.end_date}</div> : null}
        </div>
      </div>

      {!embedded && error ? <p className="admin-error">{error}</p> : null}
      {!embedded && success ? <p className="admin-success">{success}</p> : null}

      {!embedded && !readOnly ? (
        <div className="admin-test-form__footer">
          <button className="btn btn--primary" type="submit" disabled={isSubmitting || submitDisabled}>
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
