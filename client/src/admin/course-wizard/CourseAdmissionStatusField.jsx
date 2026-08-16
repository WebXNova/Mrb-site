import PremiumFormField from '../components/courses/PremiumFormField';

export const ADMISSION_OPTIONS = [
  { value: 'OPEN', label: 'Open — new students can enroll' },
  { value: 'CLOSED', label: 'Closed — no new enrollments' },
];

export function AdmissionStatusAlert({ status }) {
  const isOpen = String(status || 'CLOSED').toUpperCase() === 'OPEN';
  if (isOpen) {
    return (
      <div className="course-edit-callout course-edit-callout--success" role="status">
        <span className="course-edit-callout__icon" aria-hidden>
          ✓
        </span>
        <div className="course-edit-callout__body">
          <p className="course-edit-callout__title">Admissions open</p>
          <p className="course-edit-callout__text">
            New students can enroll while admission status is OPEN. Existing students keep access when
            you close admissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="course-edit-callout course-edit-callout--warning" role="status">
      <span className="course-edit-callout__icon" aria-hidden>
        !
      </span>
      <div className="course-edit-callout__body">
        <p className="course-edit-callout__title">Admissions closed</p>
        <p className="course-edit-callout__text">
          New enrollments are blocked. Students who already have active access keep their course
          content — closing admissions does not remove existing access.
        </p>
      </div>
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
    <div className="course-edit-admission-field">
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
