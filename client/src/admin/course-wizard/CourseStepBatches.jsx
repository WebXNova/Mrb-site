import { COURSE_WIZARD_BATCH_TIMEZONES } from '@course-wizard-schema';
import CourseAdmissionStatusField from './CourseAdmissionStatusField.jsx';
import AdminToggleSwitch from '../components/courses/AdminToggleSwitch';

const BATCH_STATUSES = ['draft', 'published', 'archived'];

/**
 * Single-batch operational delivery editor with course admission status.
 */
export default function CourseStepBatches({
  course,
  onCourseChange,
  batches,
  onBatchChange,
  fieldErrors = {},
  batchFieldErrors = {},
}) {
  const b = batches[0];

  if (!b) {
    return (
      <div className="admin-course-wizard-step">
        <p className="admin-field__error" role="alert">
          Internal error: no batch state found.
        </p>
      </div>
    );
  }

  const errorMessage = batchFieldErrors[0];

  return (
    <div className="admin-course-wizard-step">
      <p className="admin-courses__muted">
        Configure cohort delivery and whether new students can enroll. Catalog visibility (Active /
        Inactive) is set after create, on the course General tab.
      </p>

      <div className="admin-course-wizard-step__admission">
        <CourseAdmissionStatusField
          admissionStatus={course.admission_status}
          onChange={onCourseChange}
          fieldErrors={fieldErrors}
        />
      </div>

      <fieldset className="admin-card admin-course-wizard-step__batch">
        <legend className="heading-4 admin-course-wizard-step__legend">
          Batch delivery
        </legend>
        {errorMessage ? (
          <div className="admin-field__error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <div className="admin-form-grid">
          <div className="admin-field">
            <label>Title</label>
            <input value={b.title} onChange={(e) => onBatchChange(0, { title: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Instructor</label>
            <input
              value={b.instructor_name ?? ''}
              onChange={(e) => onBatchChange(0, { instructor_name: e.target.value || null })}
            />
          </div>
          <div className="admin-field">
            <label>Timezone</label>
            <select value={b.timezone} onChange={(e) => onBatchChange(0, { timezone: e.target.value })}>
              {COURSE_WIZARD_BATCH_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label>Status</label>
            <select value={b.status} onChange={(e) => onBatchChange(0, { status: e.target.value })}>
              {BATCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-course-wizard-step__seats">
            <div className="admin-field">
              <label>Seats</label>
              <input
                type="number"
                min={1}
                value={b.total_seats}
                onChange={(e) => onBatchChange(0, { total_seats: Number(e.target.value) })}
              />
            </div>
            <div className="admin-field">
              <label>Reserved seats (fantasy)</label>
              <input
                type="number"
                min={0}
                value={b.seats_fantasy ?? 0}
                onChange={(e) => onBatchChange(0, { seats_fantasy: Number(e.target.value) })}
              />
            </div>
            <div className="admin-field">
              <label>Schedule label</label>
              <input
                value={b.schedule_label ?? ''}
                onChange={(e) => onBatchChange(0, { schedule_label: e.target.value || null })}
              />
            </div>
          </div>

          <div className="admin-course-wizard-step__toggles">
            <AdminToggleSwitch
              id="batch-is-active"
              name="is_active"
              checked={!!b.is_active}
              onChange={(e) => onBatchChange(0, { is_active: e.target.checked })}
              label="Active"
            />
            <AdminToggleSwitch
              id="batch-show-publicly"
              name="show_publicly"
              checked={!!b.show_publicly}
              onChange={(e) => onBatchChange(0, { show_publicly: e.target.checked })}
              label="Show publicly"
            />
            <AdminToggleSwitch
              id="batch-recordings-enabled"
              name="recordings_enabled"
              checked={!!b.recordings_enabled}
              onChange={(e) => onBatchChange(0, { recordings_enabled: e.target.checked })}
              label="Recordings enabled"
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
