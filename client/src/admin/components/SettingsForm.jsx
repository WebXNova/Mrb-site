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
  submitLabel = 'Save Settings',
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

  return (
    <form className="admin-test-form" onSubmit={readOnly ? (event) => event.preventDefault() : onSubmit} noValidate>
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

      {error ? <p className="admin-error">{error}</p> : null}
      {success ? <p className="admin-success">{success}</p> : null}

      {!readOnly ? (
        <div className="admin-test-form__footer">
          <button className="btn btn--primary" type="submit" disabled={isSubmitting || submitDisabled}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
