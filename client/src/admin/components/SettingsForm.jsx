/**
 * Shared Step 3 settings & access form for wizard and edit flows.
 */
import AdminToggleSwitch from './courses/AdminToggleSwitch';

const EXAM_BEHAVIOR_TOGGLES = [
  {
    name: 'shuffle_questions',
    label: 'Shuffle questions',
    hint: 'Each attempt receives questions in a randomized order (stable for that attempt).',
  },
  {
    name: 'shuffle_options',
    label: 'Shuffle options',
    hint: 'Answer choices are shuffled per question; grading uses option IDs, not display order.',
  },
  {
    name: 'show_explanations',
    label: 'Show explanations',
    hint: 'Include question explanations on the result review when results are released.',
  },
  {
    name: 'show_result_immediately',
    label: 'Show result immediately',
    hint: 'When off, students see a confirmation after submit; scores appear when you re-enable this setting.',
  },
];

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

  const fields = (
    <>
      <div className="test-setup-section test-setup-section--behavior">
        <div className="test-setup-section__head">
          <h2 className="test-setup-section__title">Exam behavior</h2>
          <p className="test-setup-section__lead">
            Control delivery randomization and what students see after they finish.
          </p>
        </div>
        <div className="test-setup-toggles">
          {EXAM_BEHAVIOR_TOGGLES.map(({ name, label, hint }) => (
            <AdminToggleSwitch
              key={name}
              id={`test-setting-${name}`}
              name={name}
              checked={Boolean(form[name])}
              onChange={onCheckboxChange}
              label={label}
              hint={hint}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      <div className="test-setup-section test-setup-section--access">
        <div className="test-setup-section__head">
          <h2 className="test-setup-section__title">Access &amp; timing</h2>
          <p className="test-setup-section__lead">
            Who can take this test and when it is available. Retake limits are set under Rules &amp; scoring.
          </p>
        </div>
        <div className="test-setup-fields">
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
            <p className="admin-field__hint">Optional. Leave blank for no start restriction.</p>
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
            <p className="admin-field__hint">Must be on or after start date (equal is allowed).</p>
            {fieldErrors.end_date ? <div className="admin-field__error">{fieldErrors.end_date}</div> : null}
          </div>
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
    return <section className="admin-test-form-section test-setup-settings">{fields}</section>;
  }

  return (
    <form className="admin-test-form" onSubmit={readOnly ? (event) => event.preventDefault() : onSubmit} noValidate>
      {fields}
    </form>
  );
}
