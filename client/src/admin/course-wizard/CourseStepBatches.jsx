import { COURSE_WIZARD_BATCH_TIMEZONES } from '@course-wizard-schema';

const BATCH_STATUSES = ['draft', 'published', 'upcoming', 'enrollment_open', 'running', 'completed', 'cancelled', 'archived'];

export default function CourseStepBatches({ batches, onBatchChange, onAddBatch, onRemoveBatch, fieldErrors }) {
  return (
    <div className="admin-course-wizard-step">
      <p className="admin-courses__muted">
        Operational delivery only — no description field. Enrollment must close before the batch start date.
      </p>
      {batches.map((b, idx) => (
        <fieldset key={idx} className="admin-card" style={{ marginTop: '1rem', padding: '1rem' }}>
          <legend className="heading-4" style={{ padding: '0 0.25rem' }}>
            Batch {idx + 1}
          </legend>
          {fieldErrors[idx] ? (
            <div className="admin-field__error" role="alert" style={{ marginBottom: '0.75rem' }}>
              {fieldErrors[idx]}
            </div>
          ) : null}
          <div className="admin-form-grid">
            <div className="admin-field">
              <label>Title</label>
              <input
                value={b.title}
                onChange={(e) => onBatchChange(idx, { title: e.target.value })}
              />
            </div>
            <div className="admin-field">
              <label>Code (optional)</label>
              <input
                value={b.code ?? ''}
                placeholder="Auto-generated if empty"
                onChange={(e) => onBatchChange(idx, { code: e.target.value || undefined })}
              />
            </div>
            <div className="admin-field">
              <label>Instructor</label>
              <input
                value={b.instructor_name ?? ''}
                onChange={(e) => onBatchChange(idx, { instructor_name: e.target.value || null })}
              />
            </div>
            <div className="admin-field">
              <label>Timezone</label>
              <select value={b.timezone} onChange={(e) => onBatchChange(idx, { timezone: e.target.value })}>
                {COURSE_WIZARD_BATCH_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label>Start date</label>
              <input type="date" value={b.start_date} onChange={(e) => onBatchChange(idx, { start_date: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>End date</label>
              <input type="date" value={b.end_date} onChange={(e) => onBatchChange(idx, { end_date: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>Enrollment opens</label>
              <input
                type="datetime-local"
                value={toLocalDatetimeValue(b.enrollment_open_at)}
                onChange={(e) => onBatchChange(idx, { enrollment_open_at: fromLocalDatetimeValue(e.target.value) })}
              />
            </div>
            <div className="admin-field">
              <label>Enrollment closes</label>
              <input
                type="datetime-local"
                value={toLocalDatetimeValue(b.enrollment_close_at)}
                onChange={(e) => onBatchChange(idx, { enrollment_close_at: fromLocalDatetimeValue(e.target.value) })}
              />
            </div>
            <div className="admin-field">
              <label>Seats</label>
              <input
                type="number"
                min={1}
                value={b.total_seats}
                onChange={(e) => onBatchChange(idx, { total_seats: Number(e.target.value) })}
              />
            </div>
            <div className="admin-field">
              <label>Schedule label</label>
              <input
                value={b.schedule_label ?? ''}
                onChange={(e) => onBatchChange(idx, { schedule_label: e.target.value || null })}
              />
            </div>
            <div className="admin-field">
              <label>Status</label>
              <select value={b.status} onChange={(e) => onBatchChange(idx, { status: e.target.value })}>
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
                  onChange={(e) => onBatchChange(idx, { is_active: e.target.checked })}
                />{' '}
                Active
              </label>
            </div>
            <div className="admin-field">
              <label className="admin-field__inline">
                <input
                  type="checkbox"
                  checked={!!b.allow_enrollment}
                  onChange={(e) => onBatchChange(idx, { allow_enrollment: e.target.checked })}
                />{' '}
                Allow enrollment
              </label>
            </div>
            <div className="admin-field">
              <label className="admin-field__inline">
                <input
                  type="checkbox"
                  checked={!!b.show_publicly}
                  onChange={(e) => onBatchChange(idx, { show_publicly: e.target.checked })}
                />{' '}
                Show publicly
              </label>
            </div>
            <div className="admin-field">
              <label className="admin-field__inline">
                <input
                  type="checkbox"
                  checked={!!b.certificate_enabled}
                  onChange={(e) => onBatchChange(idx, { certificate_enabled: e.target.checked })}
                />{' '}
                Certificate enabled
              </label>
            </div>
            <div className="admin-field">
              <label className="admin-field__inline">
                <input
                  type="checkbox"
                  checked={!!b.recordings_enabled}
                  onChange={(e) => onBatchChange(idx, { recordings_enabled: e.target.checked })}
                />{' '}
                Recordings enabled
              </label>
            </div>
          </div>
          {batches.length > 1 ? (
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: '0.75rem' }} onClick={() => onRemoveBatch(idx)}>
              Remove batch
            </button>
          ) : null}
        </fieldset>
      ))}
      <button type="button" className="btn btn--secondary btn--sm" style={{ marginTop: '1rem' }} onClick={onAddBatch}>
        Add batch
      </button>
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
