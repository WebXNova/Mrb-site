import PremiumFormField from '../components/courses/PremiumFormField';

export const ADMISSION_HINT =
  'OPEN allows new enrollments and keeps the course visible in the catalog. CLOSED blocks new enrollments and hides the course from the public catalog — existing students keep their access.';

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
            New students can enroll, and the course can appear in the public catalog. Existing
            students keep access if you later close admissions.
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
          New enrollments are blocked, and the course is hidden from the public catalog. Students
          who already have access keep it — closing admissions does not revoke them.
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
        hint={ADMISSION_HINT}
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
