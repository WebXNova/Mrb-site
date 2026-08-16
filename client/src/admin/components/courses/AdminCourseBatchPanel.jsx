import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import { useAdminToast } from '../../context/AdminToastContext';
import {
  BATCH_STATUSES,
  BATCH_TIMEZONES,
  batchStatusBadgeClass,
  batchStatusLabel,
  formatSeatLine,
  fromLocalDatetimeValue,
  toLocalDatetimeValue,
} from '../../../course/batchPresentation';
import AdminToggleSwitch from './AdminToggleSwitch';
import PremiumFormField from './PremiumFormField';
import AdminLoadingButton from '../AdminLoadingButton';
import CourseAdmissionStatusField from '../../course-wizard/CourseAdmissionStatusField';
import AdmissionStaleWarning from './AdmissionStaleWarning';
import { computeAdmissionStale } from '../../utils/courseStaleAdvisory';
import { toDateInputValue } from '../../course-wizard/courseScheduleValidation';
import { parseSavedBool } from '../../utils/parseSavedBool';

const emptyForm = {
  title: '',
  code: '',
  start_date: '',
  end_date: '',
  total_seats: 30,
  instructor_name: '',
  schedule_label: '',
  timezone: 'Asia/Karachi',
  status: 'draft',
  is_active: true,
  show_publicly: true,
  recordings_enabled: true,
};

/** Placeholder for create — server generates the real batch code. */
const CREATE_CODE_PLACEHOLDER = 'AUTO';

function batchRowToForm(row) {
  if (!row) return { ...emptyForm };
  return {
    title: row.title || '',
    code: row.code || '',
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    total_seats: Number(row.total_seats ?? 0) || 1,
    instructor_name: row.instructor_name || '',
    schedule_label: row.schedule_label || '',
    timezone: row.timezone || 'Asia/Karachi',
    status: row.status || 'draft',
    is_active: parseSavedBool(row.is_active ?? row.isActive, true),
    show_publicly: parseSavedBool(row.show_publicly ?? row.showPublicly, true),
    recordings_enabled: parseSavedBool(row.recordings_enabled ?? row.recordingsEnabled, true),
  };
}

export default function AdminCourseBatchPanel({
  token,
  courseId,
  onBatchesChange,
  admissionStatus = 'CLOSED',
  courseEndDate = null,
  onAdmissionUpdated,
}) {
  const toast = useAdminToast();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [savingAdmission, setSavingAdmission] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [admission, setAdmission] = useState(admissionStatus || 'CLOSED');
  const admissionStale = computeAdmissionStale({
    admission_status: admission,
    end_date: editingId ? toDateInputValue(form.end_date) || null : courseEndDate,
  });
  const staleEndDate = editingId ? toDateInputValue(form.end_date) || null : courseEndDate;

  useEffect(() => {
    setAdmission(admissionStatus || 'CLOSED');
  }, [admissionStatus]);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.courseBatches(token, courseId);
      const rows = Array.isArray(res?.data) ? res.data : [];
      setBatches(rows);
      onBatchesChange?.(rows);
      return rows;
    } catch (e) {
      const message = e?.message || 'Failed to load batches';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [token, courseId, onBatchesChange]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : name === 'total_seats' ? Number(value) || 0 : value,
    }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm(batchRowToForm(row));
    setError('');
    setSuccess('');
  }

  function hydrateFormFromSavedRow(savedRow, rows) {
    const match =
      savedRow ||
      (editingId ? rows.find((b) => Number(b.id) === Number(editingId)) : rows[rows.length - 1]) ||
      rows[0];
    if (match) {
      setEditingId(match.id);
      setForm(batchRowToForm(match));
    }
  }

  async function saveAdmissionStatus(courseDates = {}) {
    setSavingAdmission(true);
    setError('');
    try {
      await adminApi.updateCourse(token, courseId, {
        admission_status: admission,
        ...(courseDates.start_date !== undefined ? { start_date: courseDates.start_date } : {}),
        ...(courseDates.end_date !== undefined ? { end_date: courseDates.end_date } : {}),
      });
      onAdmissionUpdated?.({
        admission_status: admission,
        ...courseDates,
      });
      setSuccess('Admission settings saved.');
      toast.success('Admission settings saved.');
    } catch (err) {
      const message = err?.message || 'Failed to save admission status';
      setError(message);
      toast.error(message);
    } finally {
      setSavingAdmission(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        title: form.title.trim(),
        code: editingId ? form.code.trim() : CREATE_CODE_PLACEHOLDER,
        start_date: form.start_date.trim(),
        end_date: form.end_date.trim(),
        total_seats: Number(form.total_seats),
        timezone: form.timezone,
        status: form.status,
        is_active: !!form.is_active,
        show_publicly: !!form.show_publicly,
        recordings_enabled: !!form.recordings_enabled,
        instructor_name: form.instructor_name.trim() ? form.instructor_name.trim() : null,
        schedule_label: form.schedule_label.trim() ? form.schedule_label.trim() : null,
      };
      let savedRow = null;
      if (editingId) {
        const response = await adminApi.updateCourseBatch(token, editingId, payload);
        savedRow = response?.data ?? null;
      } else {
        const response = await adminApi.createCourseBatch(token, courseId, payload);
        savedRow = response?.data ?? null;
      }
      await adminApi.updateCourse(token, courseId, {
        admission_status: admission,
        start_date: toDateInputValue(form.start_date) || null,
        end_date: toDateInputValue(form.end_date) || null,
      });
      onAdmissionUpdated?.({
        admission_status: admission,
        start_date: toDateInputValue(form.start_date) || null,
        end_date: toDateInputValue(form.end_date) || null,
      });
      const successMessage = editingId ? 'Batch and admission settings saved.' : 'Batch created.';
      setSuccess(successMessage);
      toast.success(successMessage);
      const rows = await loadBatches();
      hydrateFormFromSavedRow(savedRow, rows);
    } catch (err) {
      const message = err?.message || 'Save failed';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row) {
    if (!window.confirm(`Archive batch "${row.title}"? It will be hidden from public listings.`)) return;
    setBusyId(row.id);
    setError('');
    try {
      await adminApi.archiveCourseBatch(token, row.id);
      setSuccess('Batch archived.');
      toast.success('Batch archived.');
      setEditingId(null);
      setForm(emptyForm);
      await loadBatches();
    } catch (e) {
      const message = e?.message || 'Archive failed';
      setError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(row) {
    setBusyId(row.id);
    setError('');
    try {
      await adminApi.reactivateCourseBatch(token, row.id);
      setSuccess('Batch reactivated.');
      toast.success('Batch reactivated.');
      await loadBatches();
    } catch (e) {
      const message = e?.message || 'Reactivate failed';
      setError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  const hasBatch = batches.length > 0;
  const currentBatch = batches[0] || null;
  const isCreating = !editingId;

  return (
    <div className="course-edit-section">
      <header className="course-edit-section__header">
        <div>
          <h2 className="course-edit-section__title">Batch delivery</h2>
          <p className="course-edit-section__subtitle">
            One operational cohort per course — schedule, seats, delivery settings, and admission
            status for new enrollments.
          </p>
        </div>
        {hasBatch && !editingId ? (
          <button type="button" className="btn--course-secondary" onClick={() => startEdit(currentBatch)}>
            Edit batch
          </button>
        ) : null}
      </header>

      {loading ? (
        <p className="course-edit-section__loading">Loading batch…</p>
      ) : (
        <>
          <div className="course-edit-card course-edit-card--admission">
            {admissionStale ? <AdmissionStaleWarning endDate={staleEndDate} /> : null}
            <CourseAdmissionStatusField
              idPrefix="edit_batch"
              admissionStatus={admission}
              onChange={(e) => setAdmission(e.target.value)}
            />
            {hasBatch && !editingId ? (
              <div className="course-edit-admission-actions">
                <AdminLoadingButton
                  type="button"
                  className="btn--course-secondary"
                  isLoading={savingAdmission}
                  loadingLabel="Saving…"
                  onClick={() => saveAdmissionStatus()}
                >
                  Save admission status
                </AdminLoadingButton>
              </div>
            ) : null}
          </div>

          {hasBatch && !editingId ? (
            <div className="course-batch-summary">
              <div className="course-batch-summary__grid">
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Title</span>
                  <span className="course-batch-summary__value">{currentBatch.title}</span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Code</span>
                  <span className="course-batch-summary__value">
                    <code>{currentBatch.code}</code>
                  </span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Status</span>
                  <span className={batchStatusBadgeClass(currentBatch.status)}>
                    {batchStatusLabel(currentBatch.status)}
                  </span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Delivery window</span>
                  <span className="course-batch-summary__value">
                    {toLocalDatetimeValue(currentBatch.start_date) || '—'} →{' '}
                    {toLocalDatetimeValue(currentBatch.end_date) || '—'}
                  </span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Seats</span>
                  <span className="course-batch-summary__value">{formatSeatLine(currentBatch)}</span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Active</span>
                  <span className="course-batch-summary__value">{currentBatch.is_active ? 'Yes' : 'No'}</span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Show publicly</span>
                  <span className="course-batch-summary__value">
                    {parseSavedBool(currentBatch.show_publicly, true) ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="course-batch-summary__item">
                  <span className="course-batch-summary__label">Recordings enabled</span>
                  <span className="course-batch-summary__value">
                    {parseSavedBool(currentBatch.recordings_enabled, true) ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              <div className="course-batch-summary__actions">
                <button
                  type="button"
                  className="btn--course-secondary"
                  onClick={() => startEdit(currentBatch)}
                  disabled={busyId === currentBatch.id || currentBatch.status === 'archived'}
                >
                  Edit rules
                </button>
                {currentBatch.status !== 'archived' ? (
                  <AdminLoadingButton
                    type="button"
                    className="btn--course-danger"
                    isLoading={busyId === currentBatch.id}
                    loadingLabel="Archiving…"
                    onClick={() => onArchive(currentBatch)}
                  >
                    Archive
                  </AdminLoadingButton>
                ) : (
                  <AdminLoadingButton
                    type="button"
                    className="btn--course-secondary"
                    isLoading={busyId === currentBatch.id}
                    loadingLabel="Reactivating…"
                    onClick={() => onReactivate(currentBatch)}
                  >
                    Reactivate
                  </AdminLoadingButton>
                )}
              </div>
            </div>
          ) : null}

          {(!hasBatch || editingId) && (
            <form className="course-edit-form course-edit-stack" onSubmit={onSubmit}>
              <div className="course-edit-form__group">
                <h3 className="course-edit-form__group-title">Identity</h3>
                <div className="premium-form-grid premium-form-grid--2col">
                  <PremiumFormField id="batch_title" label="Batch title" required>
                    <input
                      id="batch_title"
                      className="premium-field__input"
                      name="title"
                      value={form.title}
                      onChange={onChange}
                      maxLength={180}
                      required
                      placeholder="e.g. Spring 2026 cohort"
                    />
                  </PremiumFormField>
                  <PremiumFormField
                    id="batch_code"
                    label="Batch code"
                    required={!isCreating}
                    hint={isCreating ? 'Code is auto-generated on save.' : 'Unique identifier for this cohort.'}
                  >
                    <input
                      id="batch_code"
                      className="premium-field__input"
                      name="code"
                      value={isCreating ? '' : form.code}
                      onChange={onChange}
                      maxLength={120}
                      required={!isCreating}
                      disabled={isCreating}
                      placeholder={isCreating ? 'Auto-generated' : 'e.g. ICS-SPRING-26'}
                    />
                  </PremiumFormField>
                  <PremiumFormField id="batch_instructor" label="Instructor name">
                    <input
                      id="batch_instructor"
                      className="premium-field__input"
                      name="instructor_name"
                      value={form.instructor_name}
                      onChange={onChange}
                      placeholder="Optional"
                    />
                  </PremiumFormField>
                  <PremiumFormField id="batch_schedule" label="Schedule label">
                    <input
                      id="batch_schedule"
                      className="premium-field__input"
                      name="schedule_label"
                      value={form.schedule_label}
                      onChange={onChange}
                      placeholder="e.g. Mon–Fri 6–8 PM"
                    />
                  </PremiumFormField>
                </div>
              </div>

              <div className="course-edit-form__group">
                <h3 className="course-edit-form__group-title">Course schedule</h3>
                <div className="premium-form-grid premium-form-grid--2col">
                  <PremiumFormField id="batch_start" label="Course start date & time" required>
                    <input
                      id="batch_start"
                      className="premium-field__input"
                      type="datetime-local"
                      value={toLocalDatetimeValue(form.start_date)}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, start_date: fromLocalDatetimeValue(e.target.value) }))
                      }
                      required
                    />
                  </PremiumFormField>
                  <PremiumFormField id="batch_end" label="Course end date & time" required>
                    <input
                      id="batch_end"
                      className="premium-field__input"
                      type="datetime-local"
                      value={toLocalDatetimeValue(form.end_date)}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, end_date: fromLocalDatetimeValue(e.target.value) }))
                      }
                      required
                    />
                  </PremiumFormField>
                  <PremiumFormField id="batch_timezone" label="Timezone">
                    <select
                      id="batch_timezone"
                      className="premium-field__select"
                      name="timezone"
                      value={form.timezone}
                      onChange={onChange}
                    >
                      {BATCH_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </PremiumFormField>
                  <PremiumFormField id="batch_seats" label="Total seats" required>
                    <input
                      id="batch_seats"
                      className="premium-field__input"
                      name="total_seats"
                      type="number"
                      min={1}
                      value={form.total_seats}
                      onChange={onChange}
                      required
                    />
                  </PremiumFormField>
                </div>
              </div>

              <div className="course-edit-form__group">
                <h3 className="course-edit-form__group-title">Lifecycle & visibility rules</h3>
                <div className="premium-form-grid premium-form-grid--2col">
                  <PremiumFormField id="batch_status" label="Status">
                    <select
                      id="batch_status"
                      className="premium-field__select"
                      name="status"
                      value={form.status}
                      onChange={onChange}
                    >
                      {BATCH_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {batchStatusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </PremiumFormField>
                  <div className="premium-form-grid__span-2 course-edit-form__toggles">
                    <AdminToggleSwitch
                      id="batch_active"
                      name="is_active"
                      checked={!!form.is_active}
                      onChange={onChange}
                      label="Active batch"
                      hint="Inactive batches are hidden from delivery flows."
                    />
                    <AdminToggleSwitch
                      id="batch_show_public"
                      name="show_publicly"
                      checked={!!form.show_publicly}
                      onChange={onChange}
                      label="Show publicly"
                    />
                    <AdminToggleSwitch
                      id="batch_recordings"
                      name="recordings_enabled"
                      checked={!!form.recordings_enabled}
                      onChange={onChange}
                      label="Recordings enabled"
                    />
                  </div>
                </div>
              </div>

              {error ? <p className="admin-error">{error}</p> : null}
              {success ? <p className="admin-success">{success}</p> : null}

              <div className="course-edit-form__actions">
                <AdminLoadingButton
                  className="btn--course-primary"
                  type="submit"
                  isLoading={saving}
                  loadingLabel="Saving…"
                >
                  {editingId ? 'Save batch rules' : 'Create batch'}
                </AdminLoadingButton>
                {editingId && hasBatch ? (
                  <button type="button" className="btn--course-secondary" onClick={startCreate} disabled={saving}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
