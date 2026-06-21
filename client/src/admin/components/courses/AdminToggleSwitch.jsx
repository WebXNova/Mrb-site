export default function AdminToggleSwitch({ id, name, checked, onChange, label, hint, disabled = false }) {
  return (
    <label className="admin-toggle" htmlFor={id}>
      <input
        id={id}
        className="admin-toggle__input"
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="admin-toggle__track" aria-hidden>
        <span className="admin-toggle__thumb" />
      </span>
      <span>
        <span className="admin-toggle__text">{label}</span>
        {hint ? (
          <span className="premium-field__hint" style={{ display: 'block', marginTop: '0.15rem' }}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
