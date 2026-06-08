/**
 * Shared Step 2 rules & scoring form for wizard and edit flows.
 */
export default function RulesForm({
  form,
  fieldErrors,
  error,
  success,
  isSubmitting,
  readOnly = false,
  submitDisabled = false,
  onChange,
  onSubmit,
  submitLabel = 'Save Rules',
}) {
  const disabled = isSubmitting || readOnly;

  return (
    <form className="admin-test-form" onSubmit={readOnly ? (event) => event.preventDefault() : onSubmit} noValidate>
      <h2 className="heading-4">Rules & Scoring</h2>
      <p className="admin-field__hint" style={{ marginTop: 'var(--space-2)' }}>
        Configure timing, attempts, and how answers are graded.
      </p>

      <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <div className="admin-field">
          <label htmlFor="duration_minutes">Duration (minutes)</label>
          <input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            min={1}
            max={600}
            step={1}
            value={form.duration_minutes}
            onChange={onChange}
            required
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.duration_minutes)}
          />
          {fieldErrors.duration_minutes ? (
            <div className="admin-field__error">{fieldErrors.duration_minutes}</div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="max_attempts">Max attempts</label>
          <input
            id="max_attempts"
            name="max_attempts"
            type="number"
            min={1}
            max={50}
            step={1}
            value={form.max_attempts}
            onChange={onChange}
            required
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.max_attempts)}
          />
          {fieldErrors.max_attempts ? <div className="admin-field__error">{fieldErrors.max_attempts}</div> : null}
        </div>

        <div className="admin-field">
          <label htmlFor="passing_percentage">Passing percentage</label>
          <input
            id="passing_percentage"
            name="passing_percentage"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.passing_percentage}
            onChange={onChange}
            placeholder="e.g. 50"
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.passing_percentage)}
          />
          {fieldErrors.passing_percentage ? (
            <div className="admin-field__error">{fieldErrors.passing_percentage}</div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="passing_marks">Passing marks</label>
          <input
            id="passing_marks"
            name="passing_marks"
            type="number"
            min={0}
            step={1}
            value={form.passing_marks}
            onChange={onChange}
            placeholder="Optional"
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.passing_marks)}
          />
          {fieldErrors.passing_marks ? <div className="admin-field__error">{fieldErrors.passing_marks}</div> : null}
        </div>

        <div className="admin-field admin-field--full">
          <label htmlFor="negative_marking">Negative marking factor</label>
          <input
            id="negative_marking"
            name="negative_marking"
            type="number"
            min={0}
            max={1}
            step={0.25}
            value={form.negative_marking}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors.negative_marking)}
          />
          <div className="admin-field__hint">0 = disabled · 0.25 = quarter mark deducted per wrong answer</div>
          {fieldErrors.negative_marking ? (
            <div className="admin-field__error">{fieldErrors.negative_marking}</div>
          ) : null}
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
