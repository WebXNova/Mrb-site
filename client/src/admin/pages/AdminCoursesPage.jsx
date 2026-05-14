import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken, getStoredUser } from '../../auth/session';
import AdminCourseSubjectsPanel from './AdminCourseSubjectsPanel';
import CourseCreateWizard from '../course-wizard/CourseCreateWizard.jsx';
import './AdminCoursesPage.css';

const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const PRICING_TYPES = ['free', 'one_time', 'subscription'];
const SUPPORTED_CURRENCIES = ['PKR'];

const initialForm = {
  title: '',
  description: '',
  short_description: '',
  level: 'beginner',
  thumbnail_url: '',
  is_active: true,
};

const initialPricingForm = {
  pricing_type: 'free',
  price_amount: '0',
  original_price_amount: '',
  currency_code: 'PKR',
  is_active: true,
};

function newDraftKey() {
  return typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const initialDraftSubjects = () => [{ key: newDraftKey(), title: '', description: '' }];

export default function AdminCoursesPage() {
  const token = getAdminToken();
  const adminUser = typeof window !== 'undefined' ? getStoredUser('admin_user') : null;
  const isSuperAdmin = adminUser?.role === 'super_admin';
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef(null);
  const pricingSectionRef = useRef(null);
  const subjectsSectionRef = useRef(null);
  const [pricingForm, setPricingForm] = useState(initialPricingForm);
  const [draftSubjectsRows, setDraftSubjectsRows] = useState(initialDraftSubjects);
  const [subjectsDraftError, setSubjectsDraftError] = useState('');
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [pricingSuccess, setPricingSuccess] = useState('');

  function scrollToPricing() {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function scrollToSubjects() {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      subjectsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function formatPricingCell(pricing) {
    if (!pricing) return '—';
    if (pricing.type === 'free') return 'Free';
    const amount = Number(pricing.price_amount || 0).toLocaleString('en-PK');
    const currency = pricing.currency || 'PKR';
    return `${currency} ${amount}`;
  }

  async function loadCourses() {
    const response = await adminApi.courses(token);
    setCourses(response?.data || []);
  }

  useEffect(() => {
    loadCourses().catch((err) => setError(err.message || 'Failed to load courses'));
  }, []);

  function onChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
    setPricingForm(initialPricingForm);
    setDraftSubjectsRows(initialDraftSubjects());
    setSubjectsDraftError('');
    setPricingError('');
    setPricingSuccess('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function buildSubjectsPayloadFromDraft() {
    return draftSubjectsRows
      .map((r) => ({
        title: String(r.title ?? '').trim(),
        description: String(r.description ?? '').trim(),
      }))
      .filter((r) => r.title.length > 0)
      .map((r) => ({
        title: r.title,
        description: r.description === '' ? null : r.description,
      }));
  }

  /** Client-side rules aligned with `subjectSeedForCourseCreateSchema` (title 1–180, description ≤8000). */
  function getSubjectsDraftBlockingMessage() {
    const filled = buildSubjectsPayloadFromDraft();
    if (filled.length < 1) {
      return 'Add at least one unit with a non-empty title under Subjects before creating the course.';
    }
    for (const row of filled) {
      if (row.title.length > 180) return 'Each title must be at most 180 characters.';
      if (row.description && row.description.length > 8000) {
        return 'Each description must be at most 8000 characters.';
      }
    }
    return '';
  }

  const subjectsDraftValid = getSubjectsDraftBlockingMessage() === '';

  function updateDraftRow(key, patch) {
    setDraftSubjectsRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addDraftRow() {
    setDraftSubjectsRows((prev) => [...prev, { key: newDraftKey(), title: '', description: '' }]);
  }

  function removeDraftRow(key) {
    setDraftSubjectsRows((prev) => {
      if (prev.length <= 1) return initialDraftSubjects();
      return prev.filter((r) => r.key !== key);
    });
  }

  function moveDraftRow(key, delta) {
    setDraftSubjectsRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      if (i < 0) return prev;
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function pricingRowToForm(row) {
    if (!row) return initialPricingForm;
    const amount = Number.isFinite(Number(row.price_amount)) ? Number(row.price_amount) : 0;
    const original = row.original_price_amount;
    return {
      pricing_type: PRICING_TYPES.includes(row.type) ? row.type : 'one_time',
      price_amount: String(amount),
      original_price_amount: original == null ? '' : String(original),
      currency_code: SUPPORTED_CURRENCIES.includes(row.currency) ? row.currency : 'PKR',
      is_active: row.is_active === undefined ? true : Boolean(row.is_active),
    };
  }

  async function loadCoursePricing(courseId) {
    setPricingError('');
    setPricingSuccess('');
    setPricingLoading(true);
    try {
      const response = await adminApi.coursePricing(token, courseId);
      setPricingForm(pricingRowToForm(response?.data));
    } catch (err) {
      setPricingError(err.message || 'Failed to load pricing');
    } finally {
      setPricingLoading(false);
    }
  }

  function onPricingChange(event) {
    const { name, value, type, checked } = event.target;
    setPricingForm((prev) => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'pricing_type' && value === 'free') {
        next.price_amount = '0';
        next.original_price_amount = '';
      }
      return next;
    });
  }

  function buildPricingPayload() {
    const amount = Number(pricingForm.price_amount);
    const originalRaw = pricingForm.original_price_amount;
    const originalAmount = originalRaw === '' || originalRaw == null ? null : Number(originalRaw);
    return {
      pricing_type: pricingForm.pricing_type,
      price_amount: Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0,
      original_price_amount:
        originalAmount == null ? null : Number.isFinite(originalAmount) ? Math.max(0, Math.trunc(originalAmount)) : null,
      currency_code: pricingForm.currency_code || 'PKR',
      is_active: !!pricingForm.is_active,
    };
  }

  /**
   * Live, per-field validation that mirrors the backend domain rules in
   * `coursePricing.schema.js`. Returns `{ price_amount?, original_price_amount?, pricing_type? }`.
   * The pricing form's submit button is disabled while any of these are set,
   * and the messages render under the corresponding inputs.
   */
  function getPricingFieldErrors(formValues) {
    const errors = {};
    const rawAmount = formValues.price_amount;
    const amount = Number(rawAmount);
    const originalRaw = formValues.original_price_amount;
    const hasOriginal = !(originalRaw === '' || originalRaw == null);
    const originalAmount = hasOriginal ? Number(originalRaw) : null;

    if (formValues.pricing_type === 'free') {
      if (rawAmount !== '0' && Number(rawAmount) !== 0) {
        errors.price_amount = 'Free pricing forces the amount to 0.';
      }
    } else {
      if (rawAmount === '' || rawAmount == null) {
        errors.price_amount = 'Amount is required for paid pricing.';
      } else if (!Number.isFinite(amount)) {
        errors.price_amount = 'Amount must be a number.';
      } else if (!Number.isInteger(amount)) {
        errors.price_amount = 'Amount must be a whole number (no decimals).';
      } else if (amount < 0) {
        errors.price_amount = 'Amount cannot be negative.';
      } else if (amount > 10_000_000) {
        errors.price_amount = 'Amount is too large.';
      }
    }

    if (hasOriginal) {
      if (!Number.isFinite(originalAmount)) {
        errors.original_price_amount = 'Original amount must be a number.';
      } else if (!Number.isInteger(originalAmount)) {
        errors.original_price_amount = 'Original amount must be a whole number.';
      } else if (originalAmount < 0) {
        errors.original_price_amount = 'Original amount cannot be negative.';
      } else if (originalAmount > 10_000_000) {
        errors.original_price_amount = 'Original amount is too large.';
      } else if (Number.isFinite(amount) && originalAmount <= amount) {
        errors.original_price_amount =
          'Original amount must be greater than the current amount.';
      }
    }

    return errors;
  }

  function firstPricingError(errors) {
    return errors.price_amount || errors.original_price_amount || errors.pricing_type || '';
  }

  const pricingErrors = getPricingFieldErrors(pricingForm);
  const pricingValid = Object.keys(pricingErrors).length === 0;

  async function onPricingSubmit(event) {
    event.preventDefault();
    if (!editingId) {
      // In create mode, pressing Enter inside a pricing field should run the
      // same combined create flow as the main button so the admin never gets
      // a silent no-op.
      await onSubmit(event);
      return;
    }
    setPricingError('');
    setPricingSuccess('');
    const fieldErrs = getPricingFieldErrors(pricingForm);
    if (Object.keys(fieldErrs).length > 0) {
      setPricingError(firstPricingError(fieldErrs));
      return;
    }
    const payload = buildPricingPayload();
    setPricingSaving(true);
    try {
      const response = await adminApi.updateCoursePricing(token, editingId, payload);
      setPricingForm(pricingRowToForm(response?.data));
      setPricingSuccess('Pricing saved.');
      await loadCourses();
    } catch (err) {
      setPricingError(err.message || 'Failed to save pricing');
    } finally {
      setPricingSaving(false);
    }
  }

  async function onImageFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    setImageUploading(true);
    try {
      const response = await adminApi.uploadCourseImage(token, file);
      const url = response?.data?.url;
      if (!url) throw new Error('Image upload returned no URL');
      setForm((prev) => ({ ...prev, thumbnail_url: url }));
    } catch (err) {
      setError(err.message || 'Failed to upload image');
      if (imageInputRef.current) imageInputRef.current.value = '';
    } finally {
      setImageUploading(false);
    }
  }

  function clearCoverImage() {
    setForm((prev) => ({ ...prev, thumbnail_url: '' }));
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function buildCourseWritePayload() {
    const sd = form.short_description?.trim();
    return {
      title: form.title,
      description: form.description,
      short_description: sd === '' ? null : sd ?? null,
      level: form.level || 'beginner',
      thumbnail_url: form.thumbnail_url?.trim() || null,
      is_active: !!form.is_active,
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = buildCourseWritePayload();
      if (editingId) {
        await adminApi.updateCourse(token, editingId, payload);
        setSuccess('Course updated');
        await loadCourses();
      } else {
        setSubjectsDraftError('');
        const fieldErrs = getPricingFieldErrors(pricingForm);
        if (Object.keys(fieldErrs).length > 0) {
          setPricingError(firstPricingError(fieldErrs));
          scrollToPricing();
          return;
        }
        const subjectsMsg = getSubjectsDraftBlockingMessage();
        if (subjectsMsg) {
          setSubjectsDraftError(subjectsMsg);
          scrollToSubjects();
          return;
        }
        const pricingPayload = buildPricingPayload();
        const subjectsPayload = buildSubjectsPayloadFromDraft();
        const response = await adminApi.createCourse(token, {
          ...payload,
          pricing: pricingPayload,
          subjects: subjectsPayload,
        });
        const created = response?.data;
        await loadCourses();
        if (created?.id) {
          setEditingId(created.id);
          setForm({
            ...initialForm,
            title: created.title ?? '',
            description: created.description ?? '',
            short_description: created.short_description ?? '',
            level: LEVEL_OPTIONS.includes(created.level) ? created.level : 'beginner',
            thumbnail_url: created.thumbnail_url ?? '',
            is_active: !!created.is_active,
          });
          if (created.pricing) {
            setPricingForm(pricingRowToForm(created.pricing));
          }
          setDraftSubjectsRows(initialDraftSubjects());
          setSubjectsDraftError('');
          setSuccess('Course, pricing, and subjects saved together.');
          scrollToSubjects();
        } else {
          setSuccess('Course created');
          resetForm();
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to save course');
    }
  }

  async function onArchive(courseId) {
    if (
      !window.confirm(
        'Hide this course from the catalog? It will be archived — lectures stay attached until you purge the course.'
      )
    )
      return;
    setError('');
    try {
      await adminApi.deleteCourse(token, courseId);
      await loadCourses();
      setSuccess('Course archived.');
    } catch (err) {
      setError(err.message || 'Failed to archive course');
    }
  }

  async function onPurge(course) {
    if (
      !window.confirm(
        `PERMANENTLY delete "${course.title}"? This removes the catalog row.${
          isSuperAdmin
            ? ' If lectures are attached you will be prompted to confirm cascade deletion.'
            : ''
        }`
      )
    )
      return;
    setError('');
    try {
      await adminApi.deleteCourse(token, course.id, { purge: true });
      await loadCourses();
      setSuccess('Course permanently deleted.');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('lecture') && isSuperAdmin) {
        if (
          window.confirm(
            'This course still has lectures. Delete the course and ALL attached lectures? This cannot be undone.'
          )
        ) {
          try {
            await adminApi.deleteCourse(token, course.id, { purge: true, forceCascade: true });
            await loadCourses();
            setSuccess('Course and lectures permanently deleted.');
          } catch (e2) {
            setError(e2.message || 'Failed to purge course');
          }
        }
        return;
      }
      setError(msg || 'Failed to purge course');
    }
  }

  function onEdit(course) {
    setEditingId(course.id);
    setForm({
      ...initialForm,
      title: course.title ?? '',
      description: course.description ?? '',
      short_description: course.short_description ?? '',
      level: LEVEL_OPTIONS.includes(course.level) ? course.level : 'beginner',
      thumbnail_url: course.thumbnail_url ?? '',
      is_active: !!course.is_active,
    });
    setPricingForm(initialPricingForm);
    setDraftSubjectsRows(initialDraftSubjects());
    setSubjectsDraftError('');
    setPricingError('');
    setPricingSuccess('');
    loadCoursePricing(course.id).catch(() => {});
    scrollToSubjects();
  }

  return (
    <section className="admin-page admin-page--courses">
      {!editingId ? (
        <CourseCreateWizard
          token={token}
          onCreated={(created) => {
            setError('');
            setSuccess('Course saved successfully.');
            loadCourses().catch((err) => setError(err.message || 'Failed to load courses'));
            if (created?.id) {
              setEditingId(created.id);
              setForm({
                ...initialForm,
                title: created.title ?? '',
                description: created.description ?? '',
                short_description: created.short_description ?? '',
                level: LEVEL_OPTIONS.includes(created.level) ? created.level : 'beginner',
                thumbnail_url: created.thumbnail_url ?? '',
                is_active: !!created.is_active,
              });
              setPricingForm(pricingRowToForm(created.pricing));
              setDraftSubjectsRows(initialDraftSubjects());
              setSubjectsDraftError('');
              loadCoursePricing(created.id).catch(() => {});
            }
          }}
          onCancel={() => setSuccess('')}
        />
      ) : (
        <>
          <section className="admin-card admin-courses__card">
        <h2 className="heading-3">Edit Course</h2>
        <form className="admin-courses__stack" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" value={form.title} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="level">Level</label>
              <select id="level" name="level" value={form.level} onChange={onChange} required>
                {LEVEL_OPTIONS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="course_image">Image</label>
              <input
                id="course_image"
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onImageFileChange}
                disabled={imageUploading}
              />
              <small style={{ color: 'var(--color-text-muted, #6b7280)' }}>
                {imageUploading ? 'Uploading…' : 'JPEG, PNG, or WebP. Max 5 MB.'}
              </small>
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="short_description">Short description (optional)</label>
            <textarea
              id="short_description"
              name="short_description"
              value={form.short_description}
              onChange={onChange}
              rows={2}
              maxLength={512}
              placeholder="Summary shown in listings when set"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" value={form.description} onChange={onChange} required />
          </div>

          {form.thumbnail_url ? (
            <div className="admin-field">
              <span>Image preview</span>
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <img
                  src={form.thumbnail_url}
                  alt="Course cover preview"
                  style={{
                    maxWidth: '240px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #e5e7eb)',
                  }}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={clearCoverImage}
                  disabled={imageUploading}
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : null}

          <label className="admin-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={onChange} />
            Active
          </label>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}

          <div className="admin-actions">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={
                imageUploading ||
                (!editingId && (!pricingValid || !subjectsDraftValid))
              }
              title={
                !editingId && !pricingValid
                  ? 'Fix pricing errors below before creating the course'
                  : !editingId && !subjectsDraftValid
                    ? 'Add at least one valid unit under Subjects below'
                    : undefined
              }
            >
              {editingId ? 'Update Course' : 'Create (course + pricing + subjects)'}
            </button>
            {editingId ? (
              <button className="btn btn--secondary" type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-card admin-courses__card" ref={pricingSectionRef}>
        <h2 className="heading-3">Pricing</h2>
        <p className="body-md admin-courses__muted" style={{ marginTop: '0.5rem' }}>
          {editingId
            ? 'Update the active pricing row for this course. The previous active row is automatically deactivated on save.'
            : 'Set initial pricing — it is saved in the same step as the course and the Subjects you add below.'}
        </p>
        {pricingLoading ? (
          <p className="body-md" style={{ marginTop: '0.75rem' }}>Loading pricing…</p>
        ) : (
          <form className="admin-courses__stack" onSubmit={onPricingSubmit} style={{ marginTop: '1rem' }}>
            <div className="admin-form-grid">
              <div className="admin-field">
                <label htmlFor="pricing_type">Pricing type</label>
                <select
                  id="pricing_type"
                  name="pricing_type"
                  value={pricingForm.pricing_type}
                  onChange={onPricingChange}
                  required
                >
                  {PRICING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'free' ? 'Free' : 'One-time payment'}
                    </option>
                  ))}
                </select>
                <small style={{ color: 'var(--color-text-muted, #6b7280)' }}>
                  {pricingForm.pricing_type === 'free'
                    ? 'Free courses always have amount 0.'
                    : 'Set a non-negative amount in whole PKR.'}
                </small>
              </div>
              <div className="admin-field">
                <label htmlFor="currency_code">Currency</label>
                <select
                  id="currency_code"
                  name="currency_code"
                  value={pricingForm.currency_code}
                  onChange={onPricingChange}
                  required
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label htmlFor="price_amount">Amount</label>
                <input
                  id="price_amount"
                  name="price_amount"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={pricingForm.price_amount}
                  onChange={onPricingChange}
                  disabled={pricingForm.pricing_type === 'free'}
                  aria-invalid={pricingErrors.price_amount ? 'true' : 'false'}
                  required
                />
                {pricingErrors.price_amount ? (
                  <small className="admin-error" style={{ marginTop: '0.25rem' }}>
                    {pricingErrors.price_amount}
                  </small>
                ) : null}
              </div>
              <div className="admin-field">
                <label htmlFor="original_price_amount">Original amount (optional)</label>
                <input
                  id="original_price_amount"
                  name="original_price_amount"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={pricingForm.original_price_amount}
                  onChange={onPricingChange}
                  disabled={pricingForm.pricing_type === 'free'}
                  aria-invalid={pricingErrors.original_price_amount ? 'true' : 'false'}
                  placeholder="Strike-through value shown on the card"
                />
                {pricingErrors.original_price_amount ? (
                  <small className="admin-error" style={{ marginTop: '0.25rem' }}>
                    {pricingErrors.original_price_amount}
                  </small>
                ) : null}
              </div>
            </div>

            <label
              className="admin-field"
              style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}
            >
              <input
                type="checkbox"
                name="is_active"
                checked={pricingForm.is_active}
                onChange={onPricingChange}
              />
              Active (publish this pricing now)
            </label>

            {pricingError ? <p className="admin-error">{pricingError}</p> : null}
            {pricingSuccess ? <p className="admin-success">{pricingSuccess}</p> : null}

            {editingId ? (
              <div className="admin-actions">
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={pricingSaving || !pricingValid}
                  title={!pricingValid ? 'Fix the highlighted fields first' : undefined}
                >
                  {pricingSaving ? 'Saving…' : 'Save Pricing'}
                </button>
              </div>
            ) : (
              <p className="body-md admin-courses__muted">
                Pricing is submitted together with the course when you click{' '}
                <strong>Create (course + pricing + subjects)</strong> above.
              </p>
            )}
          </form>
        )}
      </section>

      <section className="admin-card admin-courses__card" ref={subjectsSectionRef}>
        <h2 className="heading-3">Subjects</h2>
        {editingId ? (
          <div style={{ marginTop: '0.75rem' }}>
            <AdminCourseSubjectsPanel key={editingId} token={token} courseId={editingId} embedded />
          </div>
        ) : (
          <>
            <p className="body-md admin-courses__muted" style={{ marginTop: '0.5rem' }}>
              Add at least one row (title required, up to 180 characters; description optional, up to 8000). Order is
              top-to-bottom. Nothing is saved until you submit the full create form.
            </p>
            {subjectsDraftError ? (
              <p className="admin-error" style={{ marginTop: '0.75rem' }}>
                {subjectsDraftError}
              </p>
            ) : null}
            <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '3rem' }}>#</th>
                    <th style={{ minWidth: '12rem' }}>Unit title</th>
                    <th style={{ minWidth: '18rem' }}>Description</th>
                    <th style={{ width: '11rem' }}>Reorder</th>
                    <th style={{ width: '6rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {draftSubjectsRows.map((row, idx) => (
                    <tr key={row.key}>
                      <td>{idx + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) => updateDraftRow(row.key, { title: e.target.value })}
                          maxLength={180}
                          placeholder="e.g. Organic chemistry"
                          style={{ width: '100%', minWidth: '10rem' }}
                        />
                      </td>
                      <td>
                        <textarea
                          value={row.description}
                          onChange={(e) => updateDraftRow(row.key, { description: e.target.value })}
                          rows={2}
                          maxLength={8000}
                          placeholder="Optional context for admins and students"
                          style={{ width: '100%', minWidth: '14rem', resize: 'vertical' }}
                        />
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => moveDraftRow(row.key, -1)}
                            disabled={idx === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => moveDraftRow(row.key, 1)}
                            disabled={idx === draftSubjectsRows.length - 1}
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => removeDraftRow(row.key)}
                          title="Remove this row from the draft"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-actions" style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn--secondary" onClick={addDraftRow}>
                Add unit
              </button>
            </div>
          </>
        )}
      </section>

      </>
      )}

      <section className="admin-card admin-courses__card">
        <h2 className="heading-3">Courses</h2>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>ID</th>
                <th>Title</th>
                <th>Level</th>
                <th>Pricing</th>
                <th>Created by</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.length ? (
                courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt=""
                          style={{
                            width: '56px',
                            height: '40px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--color-text-muted, #9ca3af)' }}>—</span>
                      )}
                    </td>
                    <td>{course.id}</td>
                    <td>{course.title}</td>
                    <td>{course.level}</td>
                    <td>{formatPricingCell(course.pricing)}</td>
                    <td>{course.created_by ?? '—'}</td>
                    <td>{course.is_active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn--secondary btn--sm" onClick={() => onEdit(course)} type="button">
                          Edit
                        </button>
                        <Link
                          className="btn btn--secondary btn--sm"
                          to={`/admin/courses/${course.id}/subjects`}
                          title="Manage course subjects"
                        >
                          Subjects
                        </Link>
                        <Link
                          className="btn btn--secondary btn--sm"
                          to={`/admin/courses/${course.id}/batches`}
                          title="Manage course batches"
                        >
                          Batches
                        </Link>
                        <button
                          className="btn btn--secondary btn--sm"
                          onClick={() => onArchive(course.id)}
                          type="button"
                          title="Hide from public catalog (soft)"
                        >
                          Archive
                        </button>
                        {isSuperAdmin ? (
                          <button
                            className="btn btn--secondary btn--sm"
                            onClick={() => onPurge(course)}
                            type="button"
                            title="Hard delete (requires empty course or cascade)"
                          >
                            Purge
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No courses yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
