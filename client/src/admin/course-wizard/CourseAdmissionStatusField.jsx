import PremiumFormField from '../components/courses/PremiumFormField';

export const ADMISSION_OPTIONS = [
  { value: 'OPEN', label: 'Open — new students can enroll' },
  { value: 'CLOSED', label: 'Closed — no new enrollments' },
];

export function AdmissionStatusAlert({ status }) {
  const isOpen = String(status || 'CLOSED').toUpperCase() === 'OPEN';
  if (isOpen) {
    return (
      <div
        className="admin-card"
        role="status"
        style={{
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          borderColor: 'var(--color-success, #16a34a)',
          background: 'color-mix(in srgb, var(--color-success, #16a34a) 8%, white)',
        }}
      >
        <strong>Admissions open</strong>
        <p className="admin-courses__muted" style={{ margin: '0.35rem 0 0' }}>
          New students can enroll while admission status is OPEN. Existing students keep access when
          you close admissions.
        </p>
      </div>
    );
  }

  return (
    <div
      className="admin-card"
      role="status"
      style={{
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        borderColor: 'var(--color-warning, #d97706)',
        background: 'color-mix(in srgb, var(--color-warning, #d97706) 10%, white)',
      }}
    >
      <strong>Admissions closed</strong>
      <p className="admin-courses__muted" style={{ margin: '0.35rem 0 0' }}>
        New enrollments are blocked. Students who already have active access keep their course
        content — closing admissions does not remove existing access.
      </p>
    </div>
  );
}

/**
 * Admission status control (OPEN / CLOSED) — used on batch delivery step.
 */
export default function CourseAdmissionStatusField({
  admissionStatus = 'CLOSED',
  onChange,
  fieldErrors = {},
  idPrefix = 'wiz',
}) {
  const status = admissionStatus || 'CLOSED';

  return (
    <div>
      <AdmissionStatusAlert status={status} />
      <PremiumFormField
        id={`${idPrefix}_admission_status`}
        label="Admission status"
        required
        hint="OPEN allows new enrollments; CLOSED blocks new students only."
        error={fieldErrors.admission_status}
      >
        <select
          id={`${idPrefix}_admission_status`}
          className="premium-field__select"
          name="admission_status"
          value={status}
          onChange={onChange}
        >
          {ADMISSION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </PremiumFormField>
    </div>
  );
}
