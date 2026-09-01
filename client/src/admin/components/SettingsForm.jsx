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
          <h2 className="test-setup-section__title">Access control</h2>
          <p className="test-setup-section__lead">
            Who can see this test. Access mode does not publish the test — use Publish when the paper is ready.
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
              <option value="private">Private — admin only</option>
              <option value="public">Public — enrolled students of the assigned course</option>
            </select>
            <p className="admin-field__hint">
              {form.access_mode === 'public'
                ? 'The test information can be publicly visible, but only students actively enrolled in the assigned course can start/access the test.'
                : 'Only administrators can view this test. Switching to Public still does not allow non-enrolled students to take it.'}{' '}
              Changing access mode does not publish the test.
            </p>
            {fieldErrors.access_mode ? <div className="admin-field__error">{fieldErrors.access_mode}</div> : null}
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
