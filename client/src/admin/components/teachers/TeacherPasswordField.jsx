import { useState } from 'react';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import PremiumFormField from '../courses/PremiumFormField';

export default function TeacherPasswordField({
  id = 'teacher-password',
  label = 'Password',
  required = false,
  value,
  onChange,
  error,
  hint,
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <PremiumFormField
      id={id}
      label={label}
      required={required}
      error={error}
      hint={
        hint ||
        'At least 8 characters with uppercase, lowercase, a number, and a special character.'
      }
    >
      <div className="admin-teacher-password-field">
        <input
          id={id}
          className="premium-field__input admin-teacher-password-field__input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={required ? 'new-password' : 'off'}
          aria-describedby={`${id}-requirements`}
          disabled={disabled}
        />
        <button
          type="button"
          className="admin-teacher-password-field__toggle admin-touch-target"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          disabled={disabled}
        >
          {visible ? (
            <VisibilityOffOutlinedIcon fontSize="small" aria-hidden />
          ) : (
            <VisibilityOutlinedIcon fontSize="small" aria-hidden />
          )}
        </button>
      </div>
      <p id={`${id}-requirements`} className="admin-teacher-password-requirements">
        Minimum 8 characters · uppercase · lowercase · number · special character
      </p>
    </PremiumFormField>
  );
}
