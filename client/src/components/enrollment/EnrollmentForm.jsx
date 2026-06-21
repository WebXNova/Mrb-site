import { useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import { locationsApi } from '../../api/locationsApi.js';
import LocationSelector from './LocationSelector.jsx';

const HSSC_OPTIONS = ['Inter Class', 'First Year Class', 'Matric Class'];
const ATTEMPT_TYPES = ['Fresher', 'Improver'];

function Field({
  label,
  required = false,
  error = '',
  warning = '',
  prefilled = false,
  fieldName = '',
  children,
}) {
  const fieldClass = [
    'enrollment-field',
    prefilled ? 'enrollment-field--prefilled' : '',
    warning ? 'enrollment-field--prefill-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={fieldClass} data-field={fieldName || undefined}>
      <label>
        {label} {required ? <span>*</span> : null}
        {warning ? (
          <span className="enrollment-prefill-warning-icon" title={warning} aria-label={warning}>
            ⚠
          </span>
        ) : null}
      </label>
      {children}
      {error ? <p className="enrollment-field__error">{error}</p> : null}
      {warning && !error ? <p className="enrollment-field__prefill-warning">{warning}</p> : null}
    </div>
  );
}

export default function EnrollmentForm({
  form,
  errors,
  prefilledFields = new Set(),
  discardedFields = [],
  onChangeField,
  onLocationChange,
  onSubmit,
  onCancel,
  submitLabel = 'Continue to Payment',
  submitting = false,
}) {
  const [boards, setBoards] = useState([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsError, setBoardsError] = useState('');

  const discardedByField = useMemo(() => {
    const map = new Map();
    for (const item of discardedFields) {
      if (item?.field) {
        map.set(item.field, item.reason || 'Could not import this value from your previous enrollment.');
      }
    }
    return map;
  }, [discardedFields]);

  function isPrefilled(field) {
    return prefilledFields instanceof Set ? prefilledFields.has(field) : false;
  }

  function prefillWarning(field) {
    return discardedByField.get(field) || '';
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBoardsLoading(true);
      setBoardsError('');
      try {
        const response = await locationsApi.boards();
        if (cancelled) return;
        setBoards(response?.data || []);
      } catch (error) {
        if (!cancelled) setBoardsError(error.message || 'Failed to load boards');
      } finally {
        if (!cancelled) setBoardsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateLocation(nextSelection) {
    if (typeof onLocationChange === 'function') {
      onLocationChange(nextSelection);
      return;
    }
    onChangeField('province_id', nextSelection.province_id);
    onChangeField('district_id', nextSelection.district_id);
    onChangeField('city_id', nextSelection.city_id);
  }

  return (
    <form
      className="enrollment-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (typeof onSubmit === 'function') onSubmit();
      }}
    >
      <div className="enrollment-grid">
        <Field
          label="Email Address"
          required
          error={errors.email}
          warning={prefillWarning('email')}
          prefilled={isPrefilled('email')}
          fieldName="email"
        >
          <input
            type="email"
            value={form.email}
            onChange={(event) => onChangeField('email', event.target.value)}
            placeholder="name@example.com"
          />
        </Field>

        <Field
          label="Applicant’s Full Name"
          required
          error={errors.applicantFullName}
          warning={prefillWarning('applicantFullName')}
          prefilled={isPrefilled('applicantFullName')}
          fieldName="applicantFullName"
        >
          <input
            value={form.applicantFullName}
            onChange={(event) => onChangeField('applicantFullName', event.target.value)}
            placeholder="Your full name"
          />
        </Field>

        <Field
          label="Father’s Name"
          required
          error={errors.fatherName}
          warning={prefillWarning('fatherName')}
          prefilled={isPrefilled('fatherName')}
          fieldName="fatherName"
        >
          <input
            value={form.fatherName}
            onChange={(event) => onChangeField('fatherName', event.target.value)}
            placeholder="Father name"
          />
        </Field>

        <Field
          label="Date of Birth"
          warning={prefillWarning('dateOfBirth')}
          prefilled={isPrefilled('dateOfBirth')}
          fieldName="dateOfBirth"
        >
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(event) => onChangeField('dateOfBirth', event.target.value)}
          />
        </Field>

        <Field
          label="Gender"
          required
          error={errors.gender}
          warning={prefillWarning('gender')}
          prefilled={isPrefilled('gender')}
          fieldName="gender"
        >
          <div className="enrollment-radio-row">
            {['male', 'female'].map((gender) => (
              <label
                key={gender}
                className={`enrollment-radio-chip ${isPrefilled('gender') ? 'enrollment-radio-chip--prefilled' : ''}`}
              >
                <input type="radio" checked={form.gender === gender} onChange={() => onChangeField('gender', gender)} />
                <span>{gender === 'male' ? 'Male' : 'Female'}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="WhatsApp Number"
          required
          error={errors.whatsappNumber}
          warning={prefillWarning('whatsappNumber')}
          prefilled={isPrefilled('whatsappNumber')}
          fieldName="whatsappNumber"
        >
          <input
            value={form.whatsappNumber}
            onChange={(event) => onChangeField('whatsappNumber', event.target.value)}
            placeholder="+92 3xx xxxxxxx"
          />
        </Field>
      </div>

      <LocationSelector
        value={{
          province_id: form.province_id,
          district_id: form.district_id,
          city_id: form.city_id,
        }}
        errors={{
          province_id: errors.province_id,
          district_id: errors.district_id,
          city_id: errors.city_id,
        }}
        prefilledFields={prefilledFields}
        discardedFields={discardedFields}
        onChange={updateLocation}
      />

      <div className="enrollment-grid">
        <Field
          label="Intermediate / HSSC Status"
          required
          error={errors.hsscStatus}
          warning={prefillWarning('hsscStatus')}
          prefilled={isPrefilled('hsscStatus')}
          fieldName="hsscStatus"
        >
          <select value={form.hsscStatus} onChange={(event) => onChangeField('hsscStatus', event.target.value)}>
            <option value="">Select status</option>
            {HSSC_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Pre-Medical Intermediate Board"
          required
          error={errors.board_id || boardsError}
          warning={prefillWarning('board_id')}
          prefilled={isPrefilled('board_id')}
          fieldName="board_id"
        >
          <select
            value={form.board_id}
            onChange={(event) => onChangeField('board_id', event.target.value)}
            disabled={boardsLoading}
          >
            <option value="">
              {boardsLoading ? 'Loading boards...' : 'Select board'}
            </option>
            {boards.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name}
              </option>
            ))}
          </select>
          {boardsLoading ? (
            <p className="enrollment-field__loading">
              <span className="enrollment-spinner" aria-hidden="true" />
              Loading...
            </p>
          ) : null}
        </Field>
      </div>

      <Field
        label="MDCAT Attempt History"
        required
        error={errors.mdcatAttemptType}
        warning={prefillWarning('mdcatAttemptType')}
        prefilled={isPrefilled('mdcatAttemptType')}
        fieldName="mdcatAttemptType"
      >
        <div className="enrollment-attempt-grid">
          {ATTEMPT_TYPES.map((item) => (
            <label
              key={item}
              className={`enrollment-attempt-card ${form.mdcatAttemptType === item ? 'enrollment-attempt-card--active' : ''} ${isPrefilled('mdcatAttemptType') ? 'enrollment-attempt-card--prefilled' : ''}`}
            >
              <input type="radio" checked={form.mdcatAttemptType === item} onChange={() => onChangeField('mdcatAttemptType', item)} />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="enrollment-actions">
        <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" size="md" disabled={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
