import { COURSE_WIZARD_BATCH_TIMEZONES } from '@course-wizard-schema';
import { fromLocalDatetimeValue, toLocalDatetimeValue } from '../../course/batchPresentation';
import CourseAdmissionStatusField from './CourseAdmissionStatusField.jsx';

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
        Configure cohort delivery and whether new students can enroll. Course run dates are taken from
        the batch schedule below.
      </p>

      <div style={{ marginTop: '1rem' }}>
        <CourseAdmissionStatusField
          admissionStatus={course.admission_status}
          onChange={onCourseChange}
          fieldErrors={fieldErrors}
        />
      </div>

      <fieldset className="admin-card" style={{ marginTop: '1.25rem', padding: '1rem' }}>
        <legend className="heading-4" style={{ padding: '0 0.25rem' }}>
          Batch delivery
        </legend>
        {errorMessage ? (
          <div className="admin-field__error" role="alert" style={{ marginBottom: '0.75rem' }}>
            {errorMessage}
          </div>
        ) : null}
        <div className="admin-form-grid">
          <div className="admin-field">
            <label>Title</label>
            <input
              value={b.title}
              onChange={(e) => onBatchChange(0, { title: e.target.value })}
            />
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

          {/* Date/time row — side by side on desktop */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            <div className="admin-field">
              <label>Course start date & time</label>
              <input
                type="datetime-local"
                value={toLocalDatetimeValue(b.start_date)}
                onChange={(e) => onBatchChange(0, { start_date: fromLocalDatetimeValue(e.target.value) })}
              />
            </div>
            <div className="admin-field">
              <label>Course end date & time</label>
              <input
                type="datetime-local"
                value={toLocalDatetimeValue(b.end_date)}
                onChange={(e) => onBatchChange(0, { end_date: fromLocalDatetimeValue(e.target.value) })}
              />
            </div>
          </div>

          {/* Seats row — three fields side by side on desktop */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
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

          {/* Toggles row — horizontal on desktop */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-5)',
              alignItems: 'center',
              paddingTop: 'var(--space-2)',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: 'var(--fs-14)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--color-ink-700)',
              }}
            >
              <input
                type="checkbox"
                checked={!!b.is_active}
                onChange={(e) => onBatchChange(0, { is_active: e.target.checked })}
              />
              Active
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: 'var(--fs-14)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--color-ink-700)',
              }}
            >
              <input
                type="checkbox"
                checked={!!b.show_publicly}
                onChange={(e) => onBatchChange(0, { show_publicly: e.target.checked })}
              />
              Show publicly
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: 'var(--fs-14)',
                fontWeight: 'var(--fw-semibold)',
                color: 'var(--color-ink-700)',
              }}
            >
              <input
                type="checkbox"
                checked={!!b.recordings_enabled}
                onChange={(e) => onBatchChange(0, { recordings_enabled: e.target.checked })}
              />
              Recordings enabled
            </label>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
