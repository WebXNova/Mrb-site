import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminLoadingButton from '../components/AdminLoadingButton';
import { useAdminToast } from '../context/AdminToastContext';
import {
  formatCouponDate,
  formatCouponDiscountLabel,
  normalizeCouponCodeInput,
  validateCouponForm,
} from '../utils/couponValidation';
import '../styles/admin-coupons.css';

const EMPTY_FORM = {
  code: '',
  course_id: '',
  discount_type: 'percentage',
  discount_value: '',
  usage_limit: '',
  valid_from: '',
  valid_until: '',
};

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function todayDateInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveCoursePrice(course) {
  const amount = course?.pricing?.price_amount;
  return amount == null ? null : Number(amount);
}

export default function AdminCouponsPage() {
  const toast = useAdminToast();
  const token = getAdminToken();

  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [coupons, setCoupons] = useState([]);
  const [courses, setCourses] = useState([]);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingCoupon, setEditingCoupon] = useState(null);

  const coursesById = useMemo(() => {
    const map = new Map();
    for (const course of courses) {
      map.set(Number(course.id), course);
    }
    return map;
  }, [courses]);

  const selectedCourse = useMemo(() => {
    const id = Number(form.course_id);
    return Number.isInteger(id) && id > 0 ? coursesById.get(id) ?? null : null;
  }, [form.course_id, coursesById]);

  const loadCoupons = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.coupons(token);
      setCoupons(res?.data?.coupons ?? []);
      setCanWrite(Boolean(res?.data?.canWrite ?? true));
    } catch (err) {
      toast.error(err.message || 'Failed to load coupons.');
      setCoupons([]);
      setCanWrite(false);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const loadCourses = useCallback(async () => {
    if (!token) return;
    try {
      const response = await adminApi.courses(token);
      const list = (response?.data || [])
        .map((c) => ({
          id: Number(c.id),
          title: c.title,
          pricing: c.pricing ?? null,
        }))
        .filter((c) => Number.isInteger(c.id) && c.id > 0);
      list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
      setCourses(list);
    } catch {
      setCourses([]);
    }
  }, [token]);

  useEffect(() => {
    loadCoupons();
    loadCourses();
  }, [loadCoupons, loadCourses]);

  const activeCount = useMemo(() => coupons.filter((c) => c.isActive).length, [coupons]);

  function openCreateForm() {
    setFormMode('create');
    setEditingId(null);
    setEditingCoupon(null);
    setForm({
      ...EMPTY_FORM,
      valid_from: todayDateInputValue(),
    });
    setFormError('');
  }

  function openEditForm(coupon) {
    setFormMode('edit');
    setEditingId(coupon.id);
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code ?? '',
      course_id: String(coupon.courseId ?? ''),
      discount_type: coupon.discountType ?? 'percentage',
      discount_value: String(coupon.discountValue ?? ''),
      usage_limit: String(coupon.usageLimit ?? ''),
      valid_from: coupon.validFrom ? String(coupon.validFrom).slice(0, 10) : '',
      valid_until: coupon.validUntil ? String(coupon.validUntil).slice(0, 10) : '',
    });
    setFormError('');
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setEditingCoupon(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function handleSaveForm(event) {
    event.preventDefault();
    if (!canWrite || !token) return;

    const validationError = validateCouponForm(form, {
      price: resolveCoursePrice(selectedCourse),
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        code: normalizeCouponCodeInput(form.code),
        course_id: Number(form.course_id),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        usage_limit: Number(form.usage_limit),
        valid_from: form.valid_from,
        valid_until: form.valid_until.trim() ? form.valid_until.trim() : null,
      };

      if (formMode === 'create') {
        await adminApi.createCoupon(token, payload);
        toast.success('Coupon created.');
        closeForm();
        await loadCoupons();
      } else if (formMode === 'edit' && editingId) {
        await adminApi.updateCoupon(token, editingId, payload);
        toast.success('Coupon updated.');
        closeForm();
        await loadCoupons();
      }
    } catch (err) {
      const msg = err.message || 'Failed to save coupon.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function requestActivate(coupon) {
    setConfirmDialog({
      kind: 'activate',
      coupon,
      title: 'Activate coupon?',
      message: `"${coupon.code}" can be redeemed again while within its validity window.`,
    });
  }

  function requestDeactivate(coupon) {
    setConfirmDialog({
      kind: 'deactivate',
      coupon,
      title: 'Deactivate coupon?',
      message: `"${coupon.code}" will no longer be accepted for new redemptions. Existing redemptions are preserved.`,
    });
  }

  async function applyConfirmAction() {
    if (!confirmDialog || !token || !canWrite) return;
    const { coupon, kind } = confirmDialog;
    setBusyId(coupon.id);
    try {
      if (kind === 'activate') {
        await adminApi.activateCoupon(token, coupon.id);
        toast.success('Coupon activated.');
      } else {
        await adminApi.deactivateCoupon(token, coupon.id);
        toast.success('Coupon deactivated.');
      }
      setConfirmDialog(null);
      await loadCoupons();
    } catch (err) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  const codeLocked = formMode === 'edit' && Number(editingCoupon?.usedCount ?? 0) > 0;
  const courseLocked = codeLocked;

  return (
    <section className="admin-page admin-page--coupons">
      <header className="admin-coupons__hero">
        <div>
          <h2 className="heading-3 admin-coupons__title">Course Coupons</h2>
          <p className="admin-coupons__subtitle">
            Create discount codes scoped to one course — share manually with intended students
          </p>
        </div>
        {canWrite ? (
          <button type="button" className="btn btn--primary admin-coupons__add-btn" onClick={openCreateForm}>
            <AddIcon fontSize="small" aria-hidden />
            Add coupon
          </button>
        ) : null}
      </header>

      <div className="admin-coupons__summary">
        <article className="admin-coupons__summary-card">
          <span className="admin-coupons__summary-label">Total</span>
          <strong>{coupons.length}</strong>
        </article>
        <article className="admin-coupons__summary-card is-active">
          <span className="admin-coupons__summary-label">Active</span>
          <strong>{activeCount}</strong>
        </article>
        <article className="admin-coupons__summary-card">
          <span className="admin-coupons__summary-label">Inactive</span>
          <strong>{coupons.length - activeCount}</strong>
        </article>
      </div>

      {loading ? (
        <div className="admin-coupons__panel" aria-busy="true">
          <div className="admin-coupons__panel-head">
            <h3 className="admin-coupons__panel-title">All coupons</h3>
          </div>
          <div className="admin-coupons__skeleton-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="admin-coupons__skeleton-row">
                <div className="admin-coupons__skeleton-block admin-coupons__skeleton-block--title" />
                <div className="admin-coupons__skeleton-block admin-coupons__skeleton-block--line" />
              </div>
            ))}
          </div>
        </div>
      ) : coupons.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state__title">No coupons yet</p>
          <p className="admin-empty-state__text">Create a code tied to a course for targeted discounts.</p>
        </div>
      ) : (
        <div className="admin-coupons__panel">
          <div className="admin-coupons__panel-head">
            <h3 className="admin-coupons__panel-title">All coupons</h3>
            <span className="admin-coupons__panel-meta">{coupons.length} total</span>
          </div>
          <div className="admin-coupons__list">
            {coupons.map((coupon) => (
              <article
                key={coupon.id}
                className={`admin-coupons__row${!coupon.isActive ? ' admin-coupons__row--inactive' : ''}`}
              >
                <div className="admin-coupons__main">
                  <div className="admin-coupons__headline">
                    <h3 className="admin-coupons__code">{coupon.code}</h3>
                    <span
                      className={`admin-coupons__status ${
                        coupon.isActive
                          ? 'admin-coupons__status--active'
                          : 'admin-coupons__status--inactive'
                      }`}
                    >
                      <span className="admin-coupons__status-dot" aria-hidden />
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="admin-coupons__course">{coupon.courseTitle || `Course #${coupon.courseId}`}</p>
                  <p className="admin-coupons__details">
                    {formatCouponDiscountLabel(coupon.discountType, coupon.discountValue)}
                    {' · '}
                    {coupon.usedCount}/{coupon.usageLimit} used
                    {' · '}
                    Valid from {formatCouponDate(coupon.validFrom)}
                    {coupon.validUntil ? ` until ${formatCouponDate(coupon.validUntil)}` : ' · No expiry'}
                  </p>
                  <p className="admin-coupons__meta">
                    Updated {formatWhen(coupon.updatedAt)}
                    {coupon.updatedByName ? ` · ${coupon.updatedByName}` : ''}
                  </p>
                </div>

                {canWrite ? (
                  <div className="admin-coupons__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => openEditForm(coupon)}
                      disabled={busyId === coupon.id}
                    >
                      <EditOutlinedIcon fontSize="small" aria-hidden />
                      Edit
                    </button>
                    {coupon.isActive ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => requestDeactivate(coupon)}
                        disabled={busyId === coupon.id}
                      >
                        <PowerSettingsNewOutlinedIcon fontSize="small" aria-hidden />
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => requestActivate(coupon)}
                        disabled={busyId === coupon.id}
                      >
                        <PowerSettingsNewOutlinedIcon fontSize="small" aria-hidden />
                        Activate
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}

      {formMode ? (
        <div className="admin-coupons__modal-backdrop" role="presentation" onClick={closeForm}>
          <div
            className="admin-coupons__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-form-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="admin-coupons__modal-head">
              <h3 id="coupon-form-title" className="heading-4">
                {formMode === 'create' ? 'Add coupon' : 'Edit coupon'}
              </h3>
              <button type="button" className="admin-coupons__modal-close" onClick={closeForm} aria-label="Close">
                <CloseIcon />
              </button>
            </header>
            <form className="admin-coupons__form" onSubmit={handleSaveForm}>
              <div className="admin-field">
                <label className="admin-coupons__field-label" htmlFor="coupon-code">
                  Code
                </label>
                <input
                  id="coupon-code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  maxLength={32}
                  required
                  autoFocus
                  disabled={codeLocked}
                  placeholder="e.g. SAVE20"
                />
                {codeLocked ? (
                  <p className="admin-coupons__hint">Code is locked after the first redemption.</p>
                ) : (
                  <p className="admin-coupons__hint">Stored uppercase — letters, numbers, hyphens, underscores.</p>
                )}
              </div>

              <div className="admin-field">
                <label className="admin-coupons__field-label" htmlFor="coupon-course">
                  Course
                </label>
                <select
                  id="coupon-course"
                  value={form.course_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, course_id: e.target.value }))}
                  required
                  disabled={courseLocked}
                >
                  <option value="">Select a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
                {courseLocked ? (
                  <p className="admin-coupons__hint">Course is locked after the first redemption.</p>
                ) : null}
              </div>

              <div className="admin-coupons__form-grid">
                <div className="admin-field">
                  <label className="admin-coupons__field-label" htmlFor="coupon-discount-type">
                    Discount type
                  </label>
                  <select
                    id="coupon-discount-type"
                    value={form.discount_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, discount_type: e.target.value }))}
                    required
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat amount (PKR)</option>
                  </select>
                </div>
                <div className="admin-field">
                  <label className="admin-coupons__field-label" htmlFor="coupon-discount-value">
                    Discount value
                  </label>
                  <input
                    id="coupon-discount-value"
                    type="number"
                    min="0.01"
                    step={form.discount_type === 'percentage' ? '0.01' : '1'}
                    max={form.discount_type === 'percentage' ? '100' : undefined}
                    value={form.discount_value}
                    onChange={(e) => setForm((prev) => ({ ...prev, discount_value: e.target.value }))}
                    required
                  />
                  {form.discount_type === 'flat' && selectedCourse ? (
                    <p className="admin-coupons__hint">
                      Course price:{' '}
                      {resolveCoursePrice(selectedCourse) != null
                        ? `PKR ${Number(resolveCoursePrice(selectedCourse)).toLocaleString()}`
                        : 'not set'}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="admin-coupons__form-grid">
                <div className="admin-field">
                  <label className="admin-coupons__field-label" htmlFor="coupon-usage-limit">
                    Usage limit
                  </label>
                  <input
                    id="coupon-usage-limit"
                    type="number"
                    min={formMode === 'edit' ? String(editingCoupon?.usedCount ?? 1) : '1'}
                    step="1"
                    value={form.usage_limit}
                    onChange={(e) => setForm((prev) => ({ ...prev, usage_limit: e.target.value }))}
                    required
                  />
                  {formMode === 'edit' && Number(editingCoupon?.usedCount ?? 0) > 0 ? (
                    <p className="admin-coupons__hint">
                      Already redeemed {editingCoupon.usedCount} time(s).
                    </p>
                  ) : (
                    <p className="admin-coupons__hint">Max distinct students who can use this code.</p>
                  )}
                </div>
                {formMode === 'edit' ? (
                  <div className="admin-field">
                    <label className="admin-coupons__field-label" htmlFor="coupon-used-count">
                      Times redeemed
                    </label>
                    <input
                      id="coupon-used-count"
                      type="text"
                      value={String(editingCoupon?.usedCount ?? 0)}
                      readOnly
                      disabled
                    />
                  </div>
                ) : null}
              </div>

              <div className="admin-coupons__form-grid">
                <div className="admin-field">
                  <label className="admin-coupons__field-label" htmlFor="coupon-valid-from">
                    Valid from
                  </label>
                  <input
                    id="coupon-valid-from"
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm((prev) => ({ ...prev, valid_from: e.target.value }))}
                    required
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-coupons__field-label" htmlFor="coupon-valid-until">
                    Expiry date <span className="admin-muted">(optional)</span>
                  </label>
                  <input
                    id="coupon-valid-until"
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                  />
                </div>
              </div>

              {formError ? (
                <p className="admin-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="admin-coupons__modal-actions">
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
        <div className="admin-coupons__modal-backdrop" role="presentation">
          <div className="admin-coupons__modal admin-coupons__modal--confirm" role="alertdialog">
            <h3 className="heading-4">{confirmDialog.title}</h3>
            <p className="admin-muted">{confirmDialog.message}</p>
            <div className="admin-coupons__modal-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <AdminLoadingButton
                type="button"
                className="btn btn--primary"
                loading={busyId === confirmDialog.coupon.id}
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
