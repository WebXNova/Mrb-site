import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import {
  BATCH_STATUSES,
  BATCH_TIMEZONES,
  batchStatusBadgeClass,
  batchStatusLabel,
  formatEnrollmentWindow,
  formatSeatLine,
} from '../../course/batchPresentation';

class CourseBatchesErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <section className="admin-page">
          <section className="admin-card">
            <h2 className="heading-3">Batches</h2>
            <p className="admin-error">Something went wrong while rendering this page.</p>
          </section>
        </section>
      );
    }
    return this.props.children;
  }
}

const emptyForm = {
  title: '',
  code: '',
  start_date: '',
  end_date: '',
  enrollment_open_at: '',
  enrollment_close_at: '',
  total_seats: 30,
  instructor_name: '',
  schedule_label: '',
  timezone: 'UTC',
  status: 'draft',
  is_active: true,
};

function AdminCourseBatchesInner() {
  const token = getAdminToken();
  const { courseId: rawCourseId } = useParams();
  const courseId = Number(rawCourseId);
  const courseIdValid = Number.isFinite(courseId) && courseId > 0;

  const [courseTitle, setCourseTitle] = useState('');
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadBatches = useCallback(async () => {
    if (!courseIdValid) return;
    setLoading(true);
    try {
      const res = await adminApi.courseBatches(token, courseId);
      setBatches(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [token, courseId, courseIdValid]);

  useEffect(() => {
    if (!courseIdValid) return;
    adminApi
      .courses(token)
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        const row = list.find((c) => Number(c.id) === courseId);
        if (row) setCourseTitle(String(row.title || ''));
      })
      .catch(() => {});
  }, [token, courseId, courseIdValid]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const headerTitle = useMemo(() => {
    if (!courseIdValid) return 'Batches';
    return courseTitle ? `${courseTitle} · Batches` : `Course #${courseId} · Batches`;
  }, [courseTitle, courseId, courseIdValid]);

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
    setForm({
      title: row.title || '',
      code: row.code || '',
      start_date: row.start_date || '',
      end_date: row.end_date || '',
      enrollment_open_at: row.enrollment_open_at || '',
      enrollment_close_at: row.enrollment_close_at || '',
      total_seats: Number(row.total_seats ?? 0) || 1,
      instructor_name: row.instructor_name || '',
      schedule_label: row.schedule_label || '',
      timezone: row.timezone || 'UTC',
      status: row.status || 'draft',
      is_active: !!row.is_active,
    });
    setError('');
    setSuccess('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!courseIdValid) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        title: form.title.trim(),
        code: form.code.trim(),
        start_date: form.start_date.trim(),
        end_date: form.end_date.trim(),
        enrollment_open_at: form.enrollment_open_at.trim(),
        enrollment_close_at: form.enrollment_close_at.trim(),
        total_seats: Number(form.total_seats),
        timezone: form.timezone,
        status: form.status,
        is_active: !!form.is_active,
        instructor_name: form.instructor_name.trim() ? form.instructor_name.trim() : null,
        schedule_label: form.schedule_label.trim() ? form.schedule_label.trim() : null,
      };
      if (editingId) {
        await adminApi.updateCourseBatch(token, editingId, payload);
        setSuccess('Batch updated.');
      } else {
        await adminApi.createCourseBatch(token, courseId, payload);
        setSuccess('Batch created.');
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadBatches();
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row) {
    if (!window.confirm(`Archive batch "${row.title}" (${row.code})? It will be marked archived and hidden from public listings.`)) return;
    setBusyId(row.id);
    setError('');
    setSuccess('');
    try {
      await adminApi.archiveCourseBatch(token, row.id);
      setSuccess('Batch archived.');
      await loadBatches();
    } catch (e) {
      setError(e?.message || 'Archive failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(row) {
    setBusyId(row.id);
    setError('');
    setSuccess('');
    try {
      await adminApi.reactivateCourseBatch(token, row.id);
      setSuccess('Batch reactivated.');
      await loadBatches();
    } catch (e) {
      setError(e?.message || 'Reactivate failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!courseIdValid) {
    return (
      <section className="admin-page">
        <section className="admin-card">
          <h2 className="heading-3">Invalid course</h2>
          <p className="admin-error">Course id in the URL is not valid.</p>
          <Link to="/admin/courses" className="btn btn--secondary">
            Back to Courses
          </Link>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="heading-3">{headerTitle}</h2>
          <Link to="/admin/courses" className="btn btn--secondary btn--sm">
            Back to Courses
          </Link>
        </div>
        <p className="admin-muted" style={{ marginTop: '0.5rem' }}>
          Batches are operational cohorts: enrollment windows, seats, and lifecycle. They are not curriculum or
          pricing.
        </p>
      </section>

      <section className="admin-card">
        <h3 className="heading-4">{editingId ? 'Edit batch' : 'Create batch'}</h3>
        <form className="admin-page" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" value={form.title} onChange={onChange} maxLength={180} required />
            </div>
            <div className="admin-field">
              <label htmlFor="code">Code (unique)</label>
              <input id="code" name="code" value={form.code} onChange={onChange} maxLength={120} required />
            </div>
            <div className="admin-field">
              <label htmlFor="start_date">Start date (YYYY-MM-DD)</label>
              <input id="start_date" name="start_date" value={form.start_date} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="end_date">End date (YYYY-MM-DD)</label>
              <input id="end_date" name="end_date" value={form.end_date} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="enrollment_open_at">Enrollment opens (ISO 8601)</label>
              <input
                id="enrollment_open_at"
                name="enrollment_open_at"
                value={form.enrollment_open_at}
                onChange={onChange}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="enrollment_close_at">Enrollment closes (ISO 8601)</label>
              <input
                id="enrollment_close_at"
                name="enrollment_close_at"
                value={form.enrollment_close_at}
                onChange={onChange}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="total_seats">Total seats</label>
              <input
                id="total_seats"
                name="total_seats"
                type="number"
                min={1}
                value={form.total_seats}
                onChange={onChange}
                required
              />
            </div>
            <div className="admin-field">
              <label htmlFor="timezone">Timezone</label>
              <select id="timezone" name="timezone" value={form.timezone} onChange={onChange}>
                {BATCH_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" value={form.status} onChange={onChange}>
                {BATCH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {batchStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="instructor_name">Instructor name (optional)</label>
              <input id="instructor_name" name="instructor_name" value={form.instructor_name} onChange={onChange} />
            </div>
            <div className="admin-field">
              <label htmlFor="schedule_label">Schedule label (optional)</label>
              <input id="schedule_label" name="schedule_label" value={form.schedule_label} onChange={onChange} />
            </div>
          </div>
          <label className="admin-field" style={{ flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={onChange} />
            Active
          </label>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}

          <div className="admin-actions">
            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update batch' : 'Create batch'}
            </button>
            {editingId ? (
              <button className="btn btn--secondary" type="button" onClick={startCreate} disabled={saving}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3 className="heading-4">All batches</h3>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Code</th>
                <th>Status</th>
                <th>Enrollment window</th>
                <th>Seats</th>
                <th>Instructor</th>
                <th>Schedule</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>Loading…</td>
                </tr>
              ) : batches.length ? (
                batches.map((b) => {
                  const busy = busyId === b.id;
                  return (
                    <tr key={b.id}>
                      <td>{b.title}</td>
                      <td>
                        <code>{b.code}</code>
                      </td>
                      <td>
                        <span className={batchStatusBadgeClass(b.status)}>{batchStatusLabel(b.status)}</span>
                      </td>
                      <td style={{ maxWidth: '14rem', fontSize: '0.85rem' }}>{formatEnrollmentWindow(b)}</td>
                      <td style={{ fontSize: '0.85rem' }}>{formatSeatLine(b)}</td>
                      <td>{b.instructor_name || '—'}</td>
                      <td>{b.schedule_label || '—'}</td>
                      <td>{b.is_active ? 'Yes' : 'No'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => startEdit(b)}
                            disabled={busy || b.status === 'archived'}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => onArchive(b)}
                            disabled={busy || b.status === 'archived'}
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => onReactivate(b)}
                            disabled={busy}
                            title="Reactivate"
                          >
                            Reactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9}>No batches yet. Create one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default function AdminCourseBatchesPage() {
  return (
    <CourseBatchesErrorBoundary>
      <AdminCourseBatchesInner />
    </CourseBatchesErrorBoundary>
  );
}
