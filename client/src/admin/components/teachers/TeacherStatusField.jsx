export default function TeacherStatusField({ value, onChange, error, idPrefix = 'teacher-status', disabled = false }) {
  return (
    <fieldset className="admin-teacher-status-field">
      <legend className="admin-teacher-status-field__legend">Status</legend>
      {error ? (
        <p className="premium-field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-teacher-status-field__options">
        <label className="admin-teacher-status-field__option" htmlFor={`${idPrefix}-active`}>
          <input
            id={`${idPrefix}-active`}
            type="radio"
            name={`${idPrefix}-status`}
            value="active"
            checked={value === 'active'}
            onChange={() => onChange('active')}
            disabled={disabled}
          />
          <span className="admin-teacher-status-field__option-body">
            <strong>Active</strong>
            <span>Teacher can log in and receive student questions.</span>
          </span>
        </label>
        <label className="admin-teacher-status-field__option" htmlFor={`${idPrefix}-inactive`}>
          <input
            id={`${idPrefix}-inactive`}
            type="radio"
            name={`${idPrefix}-status`}
            value="inactive"
            checked={value === 'inactive'}
            onChange={() => onChange('inactive')}
            disabled={disabled}
          />
          <span className="admin-teacher-status-field__option-body">
            <strong>Inactive</strong>
            <span>Teacher cannot log in and cannot receive new student questions.</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
