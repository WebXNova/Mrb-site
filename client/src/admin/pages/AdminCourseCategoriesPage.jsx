import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import {
  COURSE_CATEGORY_BOARD_OPTIONS,
  COURSE_CATEGORY_CLASS_LEVEL_OPTIONS,
  COURSE_CATEGORY_DEPARTMENT_OPTIONS,
  categoryToFormMetadata,
  formatCategoryContextSubtext,
} from '../../course/courseCategoryMetadata';
import AdminLoadingButton from '../components/AdminLoadingButton';
import { useAdminToast } from '../context/AdminToastContext';
import '../styles/admin-course-categories.css';

const EMPTY_FORM = {
  name: '',
  description: '',
  class_level: 'not_applicable',
  department: 'not_applicable',
  board: 'not_applicable',
};

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function validateCategoryForm(form) {
  const name = String(form.name ?? '').trim();
  if (name.length < 2) return 'Name must be at least 2 characters.';
  if (name.length > 80) return 'Name must be at most 80 characters.';
  const desc = String(form.description ?? '').trim();
  if (desc.length > 512) return 'Description must be at most 512 characters.';
  return '';
}

export default function AdminCourseCategoriesPage() {
  const toast = useAdminToast();
  const token = getAdminToken();

  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [categories, setCategories] = useState([]);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const loadCategories = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.courseCategories(token);
      setCategories(res?.data?.categories ?? []);
      setCanWrite(Boolean(res?.data?.canWrite ?? true));
    } catch (err) {
      toast.error(err.message || 'Failed to load course categories.');
      setCategories([]);
      setCanWrite(false);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const activeCount = useMemo(() => categories.filter((c) => c.isActive).length, [categories]);

  function openCreateForm() {
    setFormMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  function openEditForm(category) {
    setFormMode('edit');
    setEditingId(category.id);
    setForm({
      name: category.name ?? '',
      description: category.description ?? '',
      ...categoryToFormMetadata(category),
    });
    setFormError('');
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function handleSaveForm(event) {
    event.preventDefault();
    if (!canWrite || !token) return;

    const validationError = validateCategoryForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() ? form.description.trim() : null,
        class_level: form.class_level,
        department: form.department,
        board: form.board,
      };

      if (formMode === 'create') {
        await adminApi.createCourseCategory(token, payload);
        toast.success('Category created.');
        closeForm();
        await loadCategories();
      } else if (formMode === 'edit' && editingId) {
        await adminApi.updateCourseCategory(token, editingId, payload);
        toast.success('Category updated.');
        closeForm();
        await loadCategories();
      }
    } catch (err) {
      const msg = err.message || 'Failed to save category.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function requestActivate(category) {
    setConfirmDialog({
      kind: 'activate',
      category,
      title: 'Activate category?',
      message: `"${category.name}" will appear in course tagging and future catalog filters.`,
    });
  }

  function requestDeactivate(category) {
    setConfirmDialog({
      kind: 'deactivate',
      category,
      title: 'Deactivate category?',
      message: `"${category.name}" will be hidden from course tagging. Existing course assignments are preserved.`,
    });
  }

  async function applyConfirmAction() {
    if (!confirmDialog || !token || !canWrite) return;
    const { category, kind } = confirmDialog;
    setBusyId(category.id);
    try {
      if (kind === 'activate') {
        await adminApi.activateCourseCategory(token, category.id);
        toast.success('Category activated.');
      } else {
        await adminApi.deactivateCourseCategory(token, category.id);
        toast.success('Category deactivated.');
      }
      setConfirmDialog(null);
      await loadCategories();
    } catch (err) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function persistReorder(nextCategories) {
    const previous = categories;
    setCategories(nextCategories);
    setReordering(true);
    try {
      const orderedIds = nextCategories.map((c) => Number(c.id));
      const res = await adminApi.reorderCourseCategories(token, orderedIds);
      setCategories(res?.data?.categories ?? nextCategories);
    } catch (err) {
      toast.error(err.message || 'Failed to reorder categories.');
      setCategories(previous);
    } finally {
      setReordering(false);
      setDragIndex(null);
      setHoverIndex(null);
    }
  }

  function handleDragStart(index) {
    if (!canWrite || reordering) return;
    setDragIndex(index);
  }

  function handleDragEnd() {
    if (dragIndex !== null && hoverIndex !== null && dragIndex !== hoverIndex) {
      const next = categories.slice();
      const [moved] = next.splice(dragIndex, 1);
      next.splice(hoverIndex, 0, moved);
      void persistReorder(next);
    } else {
      setDragIndex(null);
      setHoverIndex(null);
    }
  }

  function handleDragOver(index) {
    if (dragIndex === null || dragIndex === index) return;
    setHoverIndex(index);
  }

  return (
    <section className="admin-page admin-page--course-categories">
      <header className="admin-course-categories__hero">
        <div>
          <h2 className="heading-3 admin-course-categories__title">Course Categories</h2>
          <p className="admin-course-categories__subtitle">
            Organize courses into catalog groups — drag to reorder display priority
          </p>
        </div>
        {canWrite ? (
          <button type="button" className="btn btn--primary admin-course-categories__add-btn" onClick={openCreateForm}>
            <AddIcon fontSize="small" aria-hidden />
            Add category
          </button>
        ) : null}
      </header>

      <div className="admin-course-categories__summary">
        <article className="admin-course-categories__summary-card">
          <span className="admin-course-categories__summary-label">Total</span>
          <strong>{categories.length}</strong>
        </article>
        <article className="admin-course-categories__summary-card is-active">
          <span className="admin-course-categories__summary-label">Active</span>
          <strong>{activeCount}</strong>
        </article>
        <article className="admin-course-categories__summary-card">
          <span className="admin-course-categories__summary-label">Inactive</span>
          <strong>{categories.length - activeCount}</strong>
        </article>
      </div>

      {loading ? (
        <div className="admin-course-categories__panel" aria-busy="true">
          <div className="admin-course-categories__panel-head">
            <h3 className="admin-course-categories__panel-title">All categories</h3>
          </div>
          <div className="admin-course-categories__skeleton-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="admin-course-categories__skeleton-row">
                <div className="admin-course-categories__skeleton-block" style={{ width: 36, height: 36, borderRadius: 10 }} />
                <div>
                  <div className="admin-course-categories__skeleton-block admin-course-categories__skeleton-block--title" />
                  <div className="admin-course-categories__skeleton-block admin-course-categories__skeleton-block--line" />
                </div>
                <div className="admin-course-categories__skeleton-block" style={{ width: '80%' }} />
              </div>
            ))}
          </div>
        </div>
      ) : categories.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state__title">No categories yet</p>
          <p className="admin-empty-state__text">Create your first category to tag courses.</p>
        </div>
      ) : (
        <div className="admin-course-categories__panel" aria-busy={reordering}>
          <div className="admin-course-categories__panel-head">
            <h3 className="admin-course-categories__panel-title">All categories</h3>
            <span className="admin-course-categories__panel-meta">{categories.length} total · drag to reorder</span>
          </div>
          <div className="admin-course-categories__list">
          {categories.map((category, index) => {
            const isDragging = dragIndex === index;
            const isDragOver = hoverIndex === index && dragIndex !== index;
            const contextSubtext = formatCategoryContextSubtext(category);
            return (
              <article
                key={category.id}
                className={`admin-course-categories__row${
                  isDragging ? ' admin-course-categories__row--dragging' : ''
                }${isDragOver ? ' admin-course-categories__row--drag-over' : ''}${
                  !category.isActive ? ' admin-course-categories__row--inactive' : ''
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  handleDragOver(index);
                }}
              >
                {canWrite ? (
                  <button
                    type="button"
                    className="admin-course-categories__drag"
                    draggable={!reordering}
                    onDragStart={() => handleDragStart(index)}
                    onDragEnd={handleDragEnd}
                    aria-label={`Drag to reorder ${category.name}`}
                    title="Drag to reorder"
                    disabled={reordering}
                  >
                    <DragIndicatorIcon fontSize="small" />
                  </button>
                ) : (
                  <span className="admin-course-categories__drag admin-course-categories__drag--static" aria-hidden>
                    <DragIndicatorIcon fontSize="small" />
                  </span>
                )}

                <div className="admin-course-categories__main">
                  <div className="admin-course-categories__headline">
                    <h3 className="admin-course-categories__name">{category.name}</h3>
                    <span
                      className={`admin-course-categories__status ${
                        category.isActive
                          ? 'admin-course-categories__status--active'
                          : 'admin-course-categories__status--inactive'
                      }`}
                    >
                      <span className="admin-course-categories__status-dot" aria-hidden />
                      {category.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {contextSubtext ? (
                    <p className="admin-course-categories__context">{contextSubtext}</p>
                  ) : null}
                  {category.description ? (
                    <p className="admin-course-categories__description">{category.description}</p>
                  ) : (
                    <p className="admin-course-categories__description admin-course-categories__description--empty">
                      No description
                    </p>
                  )}
                  <p className="admin-course-categories__meta">
                    Updated {formatWhen(category.updatedAt)}
                    {category.updatedByName ? ` · ${category.updatedByName}` : ''}
                  </p>
                </div>

                {canWrite ? (
                  <div className="admin-course-categories__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => openEditForm(category)}
                      disabled={busyId === category.id}
                    >
                      <EditOutlinedIcon fontSize="small" aria-hidden />
                      Edit
                    </button>
                    {category.isActive ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => requestDeactivate(category)}
                        disabled={busyId === category.id}
                      >
                        <PowerSettingsNewOutlinedIcon fontSize="small" aria-hidden />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => requestActivate(category)}
                        disabled={busyId === category.id}
                      >
                        <PowerSettingsNewOutlinedIcon fontSize="small" aria-hidden />
                        Activate
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
          </div>
        </div>
      )}

      {formMode ? (
        <div className="admin-course-categories__modal-backdrop" role="presentation" onClick={closeForm}>
          <div
            className="admin-course-categories__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-category-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-course-categories__modal-head">
              <h3 id="course-category-form-title" className="heading-4">
                {formMode === 'create' ? 'Add category' : 'Edit category'}
              </h3>
              <button type="button" className="admin-course-categories__modal-close" onClick={closeForm} aria-label="Close">
                <CloseIcon />
              </button>
            </header>
            <form className="admin-course-categories__form" onSubmit={handleSaveForm}>
              <div className="admin-field">
                <label className="admin-course-categories__field-label" htmlFor="category-name">
                  Name
                </label>
                <input
                  id="category-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  maxLength={80}
                  required
                  autoFocus
                  placeholder="e.g. 9th Class, MDCAT"
                />
              </div>
              <div className="admin-field">
                <label className="admin-course-categories__field-label" htmlFor="category-description">
                  Description <span className="admin-muted">(optional)</span>
                </label>
                <textarea
                  id="category-description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  maxLength={512}
                  placeholder="Short note for admins — not shown on the public catalog filter"
                />
              </div>
              <div className="admin-course-categories__metadata-grid">
                <div className="admin-field">
                  <label className="admin-course-categories__field-label" htmlFor="category-class-level">
                    Class / Grade <span className="admin-muted">(optional)</span>
                  </label>
                  <select
                    id="category-class-level"
                    value={form.class_level}
                    onChange={(e) => setForm((prev) => ({ ...prev, class_level: e.target.value }))}
                  >
                    {COURSE_CATEGORY_CLASS_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field">
                  <label className="admin-course-categories__field-label" htmlFor="category-department">
                    Department / Stream <span className="admin-muted">(optional)</span>
                  </label>
                  <select
                    id="category-department"
                    value={form.department}
                    onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                  >
                    {COURSE_CATEGORY_DEPARTMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field">
                  <label className="admin-course-categories__field-label" htmlFor="category-board">
                    Board / System <span className="admin-muted">(optional)</span>
                  </label>
                  <select
                    id="category-board"
                    value={form.board}
                    onChange={(e) => setForm((prev) => ({ ...prev, board: e.target.value }))}
                  >
                    {COURSE_CATEGORY_BOARD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {formError ? (
                <p className="admin-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="admin-course-categories__modal-actions">
                <button type="button" className="btn btn--secondary" onClick={closeForm}>
                  Cancel
                </button>
                <AdminLoadingButton type="submit" className="btn btn--primary" loading={saving}>
                  {formMode === 'create' ? 'Create' : 'Save changes'}
                </AdminLoadingButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="admin-course-categories__modal-backdrop" role="presentation">
          <div className="admin-course-categories__modal admin-course-categories__modal--confirm" role="alertdialog">
            <h3 className="heading-4">{confirmDialog.title}</h3>
            <p className="admin-muted">{confirmDialog.message}</p>
            <div className="admin-course-categories__modal-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <AdminLoadingButton
                type="button"
                className="btn btn--primary"
                loading={busyId === confirmDialog.category.id}
                onClick={applyConfirmAction}
              >
                Confirm
              </AdminLoadingButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
