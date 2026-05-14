import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/adminApi';

const emptyForm = { title: '', description: '' };

/**
 * Full Subjects editor for one course. Used on the dedicated route and embedded
 * in the main admin courses page.
 */
export default function AdminCourseSubjectsPanel({ token, courseId, embedded = false }) {
  const courseIdValid = Number.isFinite(Number(courseId)) && Number(courseId) > 0;
  const numericCourseId = Number(courseId);

  const [courseTitle, setCourseTitle] = useState('');
  /** Canonical ordered list (includes inactive). */
  const [allSubjects, setAllSubjects] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [busyRowId, setBusyRowId] = useState(null);
  const [reordering, setReordering] = useState(false);

  const loadSubjects = useCallback(async () => {
    if (!courseIdValid) return;
    setLoading(true);
    try {
      const response = await adminApi.subjects(token, numericCourseId, { includeInactive: true });
      const list = Array.isArray(response?.data) ? response.data : [];
      setAllSubjects(list);
    } catch (err) {
      setError(err.message || 'Failed to load Subjects');
    } finally {
      setLoading(false);
    }
  }, [token, numericCourseId, courseIdValid]);

  useEffect(() => {
    if (!courseIdValid) return;
    adminApi
      .courses(token)
      .then((response) => {
        const list = Array.isArray(response?.data) ? response.data : [];
        const row = list.find((c) => Number(c.id) === numericCourseId);
        if (row) setCourseTitle(String(row.title || ''));
      })
      .catch(() => {});
  }, [token, numericCourseId, courseIdValid]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const visibleSubjects = useMemo(
    () => (includeInactive ? allSubjects : allSubjects.filter((s) => s.isActive)),
    [allSubjects, includeInactive]
  );

  function onFormChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setSuccess('');
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ title: row.title || '', description: row.description || '' });
    setError('');
    setSuccess('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!courseIdValid) return;
    const title = form.title.trim();
    if (!title) {
      setError('Title is required.');
      return;
    }
    if (title.length > 180) {
      setError('Title must be at most 180 characters.');
      return;
    }
    const desc = form.description.trim();
    if (desc.length > 8000) {
      setError('Description must be at most 8000 characters.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        title,
        description: desc ? desc : null,
      };
      if (editingId) {
        await adminApi.updateSubject(token, numericCourseId, editingId, payload);
        setSuccess('Row updated.');
      } else {
        await adminApi.createSubject(token, numericCourseId, payload);
        setSuccess('Row added.');
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadSubjects();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(row) {
    if (!window.confirm(`Hide "${row.title}" from Subjects? It will be soft-deactivated.`)) return;
    setBusyRowId(row.id);
    setError('');
    setSuccess('');
    try {
      await adminApi.deleteSubject(token, numericCourseId, row.id);
      setSuccess('Row deactivated.');
      await loadSubjects();
    } catch (err) {
      setError(err.message || 'Failed to deactivate');
    } finally {
      setBusyRowId(null);
    }
  }

  async function onReactivate(row) {
    setBusyRowId(row.id);
    setError('');
    setSuccess('');
    try {
      await adminApi.updateSubject(token, numericCourseId, row.id, { isActive: true });
      setSuccess('Row reactivated.');
      await loadSubjects();
    } catch (err) {
      setError(err.message || 'Failed to reactivate');
    } finally {
      setBusyRowId(null);
    }
  }

  async function moveRow(row, direction) {
    if (reordering) return;
    const canonicalIndex = allSubjects.findIndex((s) => s.id === row.id);
    if (canonicalIndex < 0) return;

    const step = direction > 0 ? 1 : -1;
    let neighborIndex = canonicalIndex + step;
    if (!includeInactive) {
      while (
        neighborIndex >= 0 &&
        neighborIndex < allSubjects.length &&
        !allSubjects[neighborIndex].isActive
      ) {
        neighborIndex += step;
      }
    }
    if (neighborIndex < 0 || neighborIndex >= allSubjects.length) return;

    const next = allSubjects.slice();
    [next[canonicalIndex], next[neighborIndex]] = [next[neighborIndex], next[canonicalIndex]];

    setReordering(true);
    setError('');
    setSuccess('');
    try {
      const orderedIds = next.map((s) => Number(s.id));
      const response = await adminApi.reorderSubjects(token, numericCourseId, orderedIds);
      const updated = Array.isArray(response?.data) ? response.data : [];
      setAllSubjects(updated);
      setSuccess('Order saved.');
    } catch (err) {
      setError(err.message || 'Failed to save new order');
    } finally {
      setReordering(false);
    }
  }

  function canMove(row, direction) {
    if (reordering) return false;
    const canonicalIndex = allSubjects.findIndex((s) => s.id === row.id);
    if (canonicalIndex < 0) return false;
    const step = direction > 0 ? 1 : -1;
    let probe = canonicalIndex + step;
    while (probe >= 0 && probe < allSubjects.length) {
      if (includeInactive || allSubjects[probe].isActive) return true;
      probe += step;
    }
    return false;
  }

  const headerTitle = useMemo(() => {
    if (!courseIdValid) return 'Subjects';
    return courseTitle ? `${courseTitle} · Subjects` : `Course #${numericCourseId} · Subjects`;
  }, [courseTitle, numericCourseId, courseIdValid]);

  if (!courseIdValid) {
    return (
      <section className="admin-card">
        <p className="admin-error">Invalid course id.</p>
      </section>
    );
  }

  return (
    <>
      {!embedded ? (
        <section className="admin-card">
          <h3 className="heading-4">{headerTitle}</h3>
          <p className="admin-muted" style={{ marginTop: '0.5rem' }}>
            Course-scoped Subjects. Use the arrows in the Order column to reorder; inactive rows stay in place when
            hidden from the list.
          </p>
        </section>
      ) : null}

      <section className="admin-card">
        <h3 className="heading-4">{editingId ? 'Edit row' : 'Add row'}</h3>
        <form className="admin-page" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="subj_panel_title">Title</label>
              <input
                id="subj_panel_title"
                name="title"
                value={form.title}
                onChange={onFormChange}
                maxLength={180}
                required
              />
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="subj_panel_description">Description (optional)</label>
            <textarea
              id="subj_panel_description"
              name="description"
              value={form.description}
              onChange={onFormChange}
              rows={3}
              maxLength={8000}
            />
          </div>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}

          <div className="admin-actions">
            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Add'}
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
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="heading-4">Subjects</h3>
          <label
            className="admin-field"
            style={{ flexDirection: 'row', gap: '0.5rem', alignItems: 'center', margin: 0 }}
          >
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '8rem' }}>Order</th>
                <th>Title</th>
                <th>Description</th>
                <th>Status</th>
                <th style={{ width: '10rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading…</td>
                </tr>
              ) : visibleSubjects.length ? (
                visibleSubjects.map((row) => {
                  const isBusy = busyRowId === row.id || reordering;
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="admin-row-actions" style={{ flexWrap: 'nowrap' }}>
                          <span style={{ minWidth: '2rem' }}>{row.orderIndex}</span>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => moveRow(row, -1)}
                            disabled={isBusy || !canMove(row, -1)}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => moveRow(row, +1)}
                            disabled={isBusy || !canMove(row, +1)}
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>{row.title}</td>
                      <td style={{ maxWidth: '24rem', whiteSpace: 'pre-wrap' }}>
                        {row.description || <span className="admin-muted">—</span>}
                      </td>
                      <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => startEdit(row)}
                            disabled={isBusy}
                          >
                            Edit
                          </button>
                          {row.isActive ? (
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => onDeactivate(row)}
                              disabled={isBusy}
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => onReactivate(row)}
                              disabled={isBusy}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5}>No rows yet. Add one above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
