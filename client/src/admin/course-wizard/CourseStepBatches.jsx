import { COURSE_WIZARD_BATCH_TIMEZONES } from '@course-wizard-schema';

const BATCH_STATUSES = ['draft', 'published', 'upcoming', 'enrollment_open', 'running', 'completed', 'cancelled', 'archived'];

/**
 * Single-batch editor.
 *
 * The wizard architecture now enforces exactly ONE batch per course.
 * This component always renders and edits `batches[0]` only.
 */
export default function CourseStepBatches({ batches, onBatchChange, fieldErrors }) {
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

  const errorMessage = fieldErrors[0];

  return (
    <div className="admin-course-wizard-step">
      <p className="admin-courses__muted">
        Operational delivery only — no description field. Enrollment must close before the batch start date.
        This wizard supports exactly one batch per course; edit the batch instead of adding more.
      </p>
      <fieldset className="admin-card" style={{ marginTop: '1rem', padding: '1rem' }}>
        <legend className="heading-4" style={{ padding: '0 0.25rem' }}>
          Batch
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
          <div className="admin-field">
            <label>Start date</label>
            <input type="date" value={b.start_date} onChange={(e) => onBatchChange(0, { start_date: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>End date</label>
            <input type="date" value={b.end_date} onChange={(e) => onBatchChange(0, { end_date: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Enrollment opens</label>
            <input
              type="datetime-local"
              value={toLocalDatetimeValue(b.enrollment_open_at)}
              onChange={(e) => onBatchChange(0, { enrollment_open_at: fromLocalDatetimeValue(e.target.value) })}
            />
          </div>
          <div className="admin-field">
            <label>Enrollment closes</label>
            <input
              type="datetime-local"
              value={toLocalDatetimeValue(b.enrollment_close_at)}
              onChange={(e) => onBatchChange(0, { enrollment_close_at: fromLocalDatetimeValue(e.target.value) })}
            />
          </div>
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
            <label>Schedule label</label>
            <input
              value={b.schedule_label ?? ''}
              onChange={(e) => onBatchChange(0, { schedule_label: e.target.value || null })}
            />
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
          <div className="admin-field">
            <label className="admin-field__inline">
              <input
                type="checkbox"
                checked={!!b.is_active}
                onChange={(e) => onBatchChange(0, { is_active: e.target.checked })}
              />{' '}
              Active
            </label>
          </div>
          <div className="admin-field">
            <label className="admin-field__inline">
              <input
                type="checkbox"
                checked={!!b.allow_enrollment}
                onChange={(e) => onBatchChange(0, { allow_enrollment: e.target.checked })}
              />{' '}
              Allow enrollment
            </label>
          </div>
          <div className="admin-field">
            <label className="admin-field__inline">
              <input
                type="checkbox"
                checked={!!b.show_publicly}
                onChange={(e) => onBatchChange(0, { show_publicly: e.target.checked })}
              />{' '}
              Show publicly
            </label>
          </div>
          <div className="admin-field">
            <label className="admin-field__inline">
              <input
                type="checkbox"
                checked={!!b.certificate_enabled}
                onChange={(e) => onBatchChange(0, { certificate_enabled: e.target.checked })}
              />{' '}
              Certificate enabled
            </label>
          </div>
          <div className="admin-field">
            <label className="admin-field__inline">
              <input
                type="checkbox"
                checked={!!b.recordings_enabled}
                onChange={(e) => onBatchChange(0, { recordings_enabled: e.target.checked })}
              />{' '}
              Recordings enabled
            </label>
          </div>
        </div>
      </fieldset>
    </div>
  );
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(local) {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
