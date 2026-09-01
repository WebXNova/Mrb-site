import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { adminApi } from '../../../api/adminApi';
import { useAdminToast } from '../../context/AdminToastContext';
import AdminCourseSubjectsPanel from '../../pages/AdminCourseSubjectsPanel';
import CourseDetailsNav from './CourseDetailsNav';
import CourseHealthPanel from './CourseHealthPanel';
import CourseControlBadges from './CourseControlBadges';
import { isCourseFinished } from './CourseFinishedBadge';
import CourseLevelBadge from './CourseLevelBadge';
import AdminCourseBatchPanel from './AdminCourseBatchPanel';
import AdminCourseNotesPanel from './AdminCourseNotesPanel';
import PremiumFormField from './PremiumFormField';
import AdminToggleSwitch from './AdminToggleSwitch';
import AdminLoadingButton from '../AdminLoadingButton';
import ThumbnailDropzone from './ThumbnailDropzone';
import CourseCategoryAssignmentField from './CourseCategoryAssignmentField';
import { evaluateCourseHealth, buildUnsavedHealthNotes } from '../../utils/courseHealth.utils';
import { parseSavedBool } from '../../utils/parseSavedBool';
import '../../styles/admin-courses-dashboard.css';
import '../../styles/admin-course-edit-layout.css';
import '../../styles/admin-course-categories.css';
import '../../styles/admin-course-notes.css';

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const PRICING_TYPES = [
  { value: 'free', label: 'Free' },
  { value: 'one_time', label: 'One-time payment' },
  { value: 'subscription', label: 'Subscription' },
];
const SUPPORTED_CURRENCIES = ['PKR'];

const initialForm = {
  title: '',
  description: '',
  short_description: '',
  level: 'beginner',
  thumbnail_url: '',
  is_active: true,
  start_date: null,
  end_date: null,
  admission_status: 'CLOSED',
  is_finished: false,
  finished_at: null,
};

const initialPricingForm = {
  pricing_type: 'free',
  price_amount: '0',
  original_price_amount: '',
  currency_code: 'PKR',
  is_active: true,
  enrollment_visible: true,
  public_purchase_visible: true,
};

function courseRowToForm(course) {
  if (!course) return { ...initialForm };
  return {
    title: course.title ?? '',
    description: course.description ?? '',
    short_description: course.short_description ?? '',
    level: LEVEL_OPTIONS.some((l) => l.value === course.level) ? course.level : 'beginner',
    thumbnail_url: course.thumbnail_url ?? '',
    is_active: !!course.is_active,
    start_date: course.start_date ?? null,
    end_date: course.end_date ?? null,
    admission_status: course.admission_status ?? 'CLOSED',
    is_finished: Boolean(course.is_finished) || Boolean(course.finished_at),
    finished_at: course.finished_at ?? null,
  };
}

function pricingRowToForm(row) {
  if (!row) return { ...initialPricingForm };
  const rawType = row.type ?? row.pricing_type ?? 'one_time';
  const rawCurrency = row.currency ?? row.currency_code ?? 'PKR';
  const amount = Number.isFinite(Number(row.price_amount)) ? Number(row.price_amount) : 0;
  const original = row.original_price_amount;
  return {
    pricing_type: PRICING_TYPES.some((t) => t.value === rawType) ? rawType : 'one_time',
    price_amount: String(amount),
    original_price_amount: original == null ? '' : String(original),
    currency_code: SUPPORTED_CURRENCIES.includes(rawCurrency) ? rawCurrency : 'PKR',
    is_active: parseSavedBool(row.is_active ?? row.isActive, true),
    enrollment_visible: parseSavedBool(
      row.enrollment_visible ?? row.enrollmentVisible,
      true
    ),
    public_purchase_visible: parseSavedBool(
      row.public_purchase_visible ?? row.publicPurchaseVisible,
      true
    ),
  };
}

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
  } else if (rawAmount === '' || !Number.isFinite(amount) || amount < 0) {
    errors.price_amount = 'Amount is required for paid pricing.';
  } else if (!Number.isInteger(amount)) {
    errors.price_amount = 'Amount must be a whole number.';
  }

  if (hasOriginal) {
    if (!Number.isFinite(originalAmount) || originalAmount <= amount) {
      errors.original_price_amount = 'Original amount must be greater than the current amount.';
    }
  }
  return errors;
}

export default function AdminCourseEditView({ courseId, token, activeTab, onTabChange, onBack, onUpdated }) {
  const toast = useAdminToast();
  const imageInputRef = useRef(null);
  const [form, setForm] = useState(initialForm);
  const [pricingForm, setPricingForm] = useState(initialPricingForm);
  const [batches, setBatches] = useState([]);
  const [activeSubjectCount, setActiveSubjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pricingError, setPricingError] = useState('');
  const [pricingSuccess, setPricingSuccess] = useState('');
  const [healthSnapshot, setHealthSnapshot] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [allCategories, setAllCategories] = useState([]);
  const [categoryIds, setCategoryIds] = useState([]);
  const [categoriesError, setCategoriesError] = useState('');

  const loadMeta = useCallback(async () => {
    setLoading(true);
    setPricingLoading(true);
    try {
      const [coursesRes, pricingRes, subjectsRes, batchesRes, categoriesRes, assignmentsRes] = await Promise.all([
        adminApi.courses(token),
        adminApi.coursePricing(token, courseId).catch(() => ({ data: null })),
        adminApi.subjects(token, courseId, { includeInactive: true }).catch(() => ({ data: [] })),
        adminApi.courseBatches(token, courseId).catch(() => ({ data: [] })),
        adminApi.courseCategories(token).catch(() => ({ data: { categories: [] } })),
        adminApi.courseCategoryAssignments(token, courseId).catch(() => ({ data: { categories: [] } })),
      ]);
      const course = (coursesRes?.data || []).find((c) => Number(c.id) === Number(courseId));
      if (!course) {
        setError('Course not found.');
        return;
      }
      setForm(courseRowToForm(course));
      setPricingForm(pricingRowToForm(pricingRes?.data));
      const subjects = Array.isArray(subjectsRes?.data) ? subjectsRes.data : [];
      setActiveSubjectCount(subjects.filter((s) => Boolean(s.isActive)).length);
      setBatches(Array.isArray(batchesRes?.data) ? batchesRes.data : []);
      setAllCategories(categoriesRes?.data?.categories ?? []);
      const assigned = assignmentsRes?.data?.categories ?? course.categories ?? [];
      setCategoryIds(assigned.map((c) => Number(c.id)));
      setCategoriesError('');
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load course');
    } finally {
      setLoading(false);
      setPricingLoading(false);
    }
  }, [token, courseId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const loadHealthSnapshot = useCallback(async () => {
    setHealthLoading(true);
    try {
      const [coursesRes, pricingRes, subjectsRes, batchesRes] = await Promise.all([
        adminApi.courses(token),
        adminApi.coursePricing(token, courseId).catch(() => ({ data: null })),
        adminApi.subjects(token, courseId, { includeInactive: true }).catch(() => ({ data: [] })),
        adminApi.courseBatches(token, courseId).catch(() => ({ data: [] })),
      ]);
      const course = (coursesRes?.data || []).find((c) => Number(c.id) === Number(courseId));
      if (!course) {
        toast.error('Could not refresh health data — course not found.');
        return;
      }
      const subjects = Array.isArray(subjectsRes?.data) ? subjectsRes.data : [];
      const batchRows = Array.isArray(batchesRes?.data) ? batchesRes.data : [];
      const savedPricing = pricingRowToForm(pricingRes?.data);
      const subjectCount = subjects.filter((s) => Boolean(s.isActive)).length;

      setHealthSnapshot({
        course: courseRowToForm(course),
        pricing: { ...savedPricing, price_amount: Number(savedPricing.price_amount) },
        batches: batchRows,
        activeSubjectCount: subjectCount,
      });
      setActiveSubjectCount(subjectCount);
      setBatches(batchRows);
    } catch (err) {
      toast.error(err.message || 'Failed to refresh health data');
    } finally {
      setHealthLoading(false);
    }
  }, [token, courseId, toast]);

  useEffect(() => {
    if (activeTab === 'health') {
      loadHealthSnapshot();
    }
  }, [activeTab, loadHealthSnapshot]);

  const healthUnsavedNotes = useMemo(
    () => buildUnsavedHealthNotes(healthSnapshot, { form, pricingForm }),
    [healthSnapshot, form, pricingForm]
  );

  const healthReport = useMemo(
    () =>
      evaluateCourseHealth({
        course: form,
        pricing: { ...pricingForm, price_amount: Number(pricingForm.price_amount) },
        batches,
        activeSubjectCount,
      }),
    [form, pricingForm, batches, activeSubjectCount]
  );

  const issueCounts = useMemo(() => {
    const byField = { general: 0, pricing: 0, subjects: 0, batch: 0, health: 0 };
    for (const check of healthReport.checks) {
      if (check.field === 'pricing' || check.field?.startsWith('pricing.')) byField.pricing += 1;
      else if (check.field === 'subjects') byField.subjects += 1;
      else if (
        check.field === 'batches' ||
        check.field?.startsWith('batches.') ||
        check.field === 'admission_status'
      ) {
        byField.batch += 1;
      } else byField.general += 1;
    }
    if (healthReport.status !== 'healthy') byField.health = healthReport.checks.length;
    return byField;
  }, [healthReport]);

  function onChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function onCategoryToggle(categoryId) {
    const id = Number(categoryId);
    setCategoryIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
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

  async function onImageFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const response = await adminApi.uploadCourseImage(token, file);
      const url = response?.data?.url;
      if (!url) throw new Error('Image upload returned no URL');
      setForm((prev) => ({ ...prev, thumbnail_url: url }));
    } catch (err) {
      toast.error(err.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  }

  async function onGeneralSubmit(e) {
    e.preventDefault();
    setSavingGeneral(true);
    setError('');
    setSuccess('');

    try {
      const sd = form.short_description?.trim();
      await adminApi.updateCourse(token, courseId, {
        title: form.title,
        description: form.description,
        short_description: sd === '' ? null : sd ?? null,
        level: form.level || 'beginner',
        thumbnail_url: form.thumbnail_url?.trim() || null,
        is_active: !!form.is_active,
      });
      await adminApi.updateCourseCategoryAssignments(token, courseId, categoryIds);
      setSuccess('Course updated.');
      toast.success('Course updated.');
      onUpdated?.();
    } catch (err) {
      setError(err.message || 'Failed to update course');
    } finally {
      setSavingGeneral(false);
    }
  }

  async function onPricingSubmit(e) {
    e.preventDefault();
    setPricingError('');
    setPricingSuccess('');
    const fieldErrs = getPricingFieldErrors(pricingForm);
    if (Object.keys(fieldErrs).length > 0) {
      setPricingError(Object.values(fieldErrs)[0]);
      return;
    }
    const amount = Number(pricingForm.price_amount);
    const originalRaw = pricingForm.original_price_amount;
    const originalAmount = originalRaw === '' ? null : Number(originalRaw);
    const payload = {
      pricing_type: pricingForm.pricing_type,
      price_amount: Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0,
      original_price_amount:
        originalAmount == null ? null : Number.isFinite(originalAmount) ? Math.max(0, Math.trunc(originalAmount)) : null,
      currency_code: pricingForm.currency_code || 'PKR',
      is_active: !!pricingForm.is_active,
      enrollment_visible: !!pricingForm.enrollment_visible,
      public_purchase_visible: !!pricingForm.public_purchase_visible,
    };
    setPricingSaving(true);
    try {
      const response = await adminApi.updateCoursePricing(token, courseId, payload);
      setPricingForm(pricingRowToForm(response?.data));
      setPricingSuccess('Pricing saved.');
      toast.success('Pricing saved.');
      onUpdated?.();
    } catch (err) {
      const message = err.message || 'Failed to save pricing';
      setPricingError(message);
      toast.error(message);
    } finally {
      setPricingSaving(false);
    }
  }

  const pricingErrors = getPricingFieldErrors(pricingForm);
  const pricingStudentPreview = useMemo(() => {
    const typeLabel =
      PRICING_TYPES.find((t) => t.value === pricingForm.pricing_type)?.label ?? pricingForm.pricing_type;
    const amount = Number(pricingForm.price_amount || 0);
    const originalRaw = pricingForm.original_price_amount;
    const original = originalRaw === '' || originalRaw == null ? null : Number(originalRaw);
    const showOriginal = original != null && Number.isFinite(original) && original > amount;
    const currency = pricingForm.currency_code || 'PKR';

    let priceLine;
    if (pricingForm.pricing_type === 'free') {
      priceLine = 'Free';
    } else if (pricingForm.pricing_type === 'subscription') {
      priceLine = `${currency} ${amount.toLocaleString('en-PK')} / subscription`;
    } else {
      priceLine = `${currency} ${amount.toLocaleString('en-PK')}`;
    }

    const visibilityNotes = [];
    if (!pricingForm.is_active) visibilityNotes.push('Inactive — not published to catalog');
    if (!pricingForm.enrollment_visible) visibilityNotes.push('Hidden from enrollment flows');
    if (!pricingForm.public_purchase_visible) visibilityNotes.push('Hidden from public purchase');

    return { typeLabel, priceLine, showOriginal, original, currency, visibilityNotes };
  }, [pricingForm]);
  const titleLen = form.title.length;
  const descLen = form.description.length;
  const shortLen = (form.short_description || '').length;

  if (loading) {
    return <p className="course-edit-loading">Loading course…</p>;
  }

  if (error && !form.title) {
    return (
      <section className="admin-card course-edit-shell">
        <p className="admin-error">{error}</p>
        <button type="button" className="btn--course-secondary" onClick={onBack}>
          Back to list
        </button>
      </section>
    );
  }

  return (
    <div className="course-edit-layout">
      <section className="course-edit-shell">
        <header className="course-edit-header">
          <button type="button" className="course-edit-header__back" onClick={onBack}>
            <ArrowBackIcon fontSize="small" aria-hidden />
            Back to list
          </button>
          <div className="course-edit-header__main">
            <div className="course-edit-header__titles">
              <h1 className="course-edit-header__title">{form.title || 'Untitled course'}</h1>
              <div className="course-edit-header__meta">
                <CourseControlBadges course={form} />
                <CourseLevelBadge level={form.level} />
                <span className="course-edit-header__id">ID {courseId}</span>
              </div>
            </div>
            <CourseHealthPanel
              course={form}
              pricing={{ ...pricingForm, price_amount: Number(pricingForm.price_amount) }}
              batches={batches}
              activeSubjectCount={activeSubjectCount}
              compact
            />
          </div>
        </header>

        <CourseDetailsNav activeTab={activeTab} onTabChange={onTabChange} issueCounts={issueCounts} />

        <div className="course-edit-body">
          {activeTab === 'general' && (
            <form className="course-edit-section course-edit-section--general" onSubmit={onGeneralSubmit}>
              <header className="course-edit-section__header">
                <div>
                  <h2 className="course-edit-section__title">General information</h2>
                  <p className="course-edit-section__subtitle">
                    Core catalog metadata — title, description, thumbnail, and visibility.
                  </p>
                </div>
              </header>
              <div className="course-edit-stack">
                <div className="course-edit-card">
                  <div className="premium-form-grid premium-form-grid--2col">
                <PremiumFormField
                  id="title"
                  label="Course title"
                  required
                  counter={`${titleLen} / 180`}
                  className="premium-form-grid__span-2"
                >
                  <input
                    id="title"
                    className="premium-field__input"
                    name="title"
                    value={form.title}
                    onChange={onChange}
                    required
                    maxLength={180}
                  />
                </PremiumFormField>
                <PremiumFormField id="level" label="Difficulty level" required>
                  <select id="level" className="premium-field__select" name="level" value={form.level} onChange={onChange}>
                    {LEVEL_OPTIONS.map((lvl) => (
                      <option key={lvl.value} value={lvl.value}>
                        {lvl.label}
                      </option>
                    ))}
                  </select>
                </PremiumFormField>
                <PremiumFormField
                  id="categories"
                  label="Categories"
                  hint="Tag this course for catalog browsing. Inactive categories stay locked if already assigned."
                  className="premium-form-grid__span-2"
                >
                  <CourseCategoryAssignmentField
                    allCategories={allCategories}
                    selectedIds={categoryIds}
                    onToggle={onCategoryToggle}
                    isLoading={loading}
                    loadError={categoriesError}
                    disabled={savingGeneral}
                  />
                </PremiumFormField>
                <PremiumFormField id="visibility" label="Catalog visibility">
                  <AdminToggleSwitch
                    id="visibility"
                    name="is_active"
                    checked={form.is_active}
                    onChange={onChange}
                    label="Active in catalog"
                    hint="Controls whether this course is visible in the public catalog and general listings."
                  />
                </PremiumFormField>
                <PremiumFormField
                  id="short_description"
                  label="Short description"
                  counter={`${shortLen} / 512`}
                  hint="Shown on course cards when set."
                  className="premium-form-grid__span-2"
                >
                  <textarea
                    id="short_description"
                    className="premium-field__textarea"
                    name="short_description"
                    value={form.short_description}
                    onChange={onChange}
                    rows={2}
                    maxLength={512}
                  />
                </PremiumFormField>
                <PremiumFormField
                  id="description"
                  label="Full description"
                  required
                  counter={`${descLen} chars`}
                  hint="Minimum 30 characters recommended for publish."
                  className="premium-form-grid__span-2"
                >
                  <textarea
                    id="description"
                    className="premium-field__textarea"
                    name="description"
                    value={form.description}
                    onChange={onChange}
                    required
                    rows={6}
                  />
                </PremiumFormField>
                <PremiumFormField
                  id="thumbnail"
                  label="Course thumbnail"
                  hint="JPEG, PNG, or WebP. Max 2 MB."
                  className="premium-form-grid__span-2"
                >
                  <ThumbnailDropzone
                    inputRef={imageInputRef}
                    imageUrl={form.thumbnail_url}
                    uploading={imageUploading}
                    onFileChange={onImageFileChange}
                    onClear={() => {
                      setForm((prev) => ({ ...prev, thumbnail_url: '' }));
                      if (imageInputRef.current) imageInputRef.current.value = '';
                    }}
                  />
                </PremiumFormField>
                  </div>
                </div>
              </div>

              {error ? <p className="admin-error">{error}</p> : null}
              {success ? <p className="admin-success">{success}</p> : null}
              <div className="course-edit-form__actions">
                <button className="btn--course-primary" type="submit" disabled={savingGeneral || imageUploading}>
                  {savingGeneral ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'pricing' && (
            <form className="course-edit-section course-edit-section--pricing" onSubmit={onPricingSubmit}>
              <header className="course-edit-section__header">
                <div>
                  <h2 className="course-edit-section__title">Pricing</h2>
                  <p className="course-edit-section__subtitle">
                    Updates append a new pricing row. The previous active row is deactivated automatically.
                  </p>
                </div>
              </header>
              {pricingLoading ? (
                <p className="course-edit-pricing-loading" aria-live="polite">
                  <span className="admin-spinner admin-spinner--sm" aria-hidden />
                  Loading pricing…
                </p>
              ) : (
                <div className="course-edit-stack">
                  <div className="course-edit-card">
                    <div className="premium-form-grid premium-form-grid--2col course-edit-pricing-grid">
                    <PremiumFormField id="pricing_type" label="Pricing type" required>
                      <select
                        id="pricing_type"
                        className="premium-field__select"
                        name="pricing_type"
                        value={pricingForm.pricing_type}
                        onChange={onPricingChange}
                      >
                        {PRICING_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </PremiumFormField>
                    <PremiumFormField id="currency_code" label="Currency">
                      <select
                        id="currency_code"
                        className="premium-field__select"
                        name="currency_code"
                        value={pricingForm.currency_code}
                        onChange={onPricingChange}
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </PremiumFormField>
                    <PremiumFormField id="price_amount" label="Amount (PKR)" error={pricingErrors.price_amount}>
                      <input
                        id="price_amount"
                        className="premium-field__input"
                        name="price_amount"
                        type="number"
                        min="0"
                        step="1"
                        value={pricingForm.price_amount}
                        onChange={onPricingChange}
                        disabled={pricingForm.pricing_type === 'free'}
                      />
                    </PremiumFormField>
                    <PremiumFormField
                      id="original_price_amount"
                      label="Original amount (optional)"
                      error={pricingErrors.original_price_amount}
                      hint="Strike-through list price on the catalog card."
                    >
                      <input
                        id="original_price_amount"
                        className="premium-field__input"
                        name="original_price_amount"
                        type="number"
                        min="0"
                        step="1"
                        value={pricingForm.original_price_amount}
                        onChange={onPricingChange}
                        disabled={pricingForm.pricing_type === 'free'}
                      />
                    </PremiumFormField>
                    <div className="premium-form-grid__span-2 course-edit-form__toggles">
                      <AdminToggleSwitch
                        id="pricing_active"
                        name="is_active"
                        checked={!!pricingForm.is_active}
                        onChange={onPricingChange}
                        label="Active pricing"
                        hint="Publish this price to the catalog now."
                      />
                      <AdminToggleSwitch
                        id="enrollment_visible"
                        name="enrollment_visible"
                        checked={!!pricingForm.enrollment_visible}
                        onChange={onPricingChange}
                        label="Enrollment visibility"
                      />
                      <AdminToggleSwitch
                        id="public_purchase_visible"
                        name="public_purchase_visible"
                        checked={!!pricingForm.public_purchase_visible}
                        onChange={onPricingChange}
                        label="Public purchase visibility"
                      />
                    </div>
                  </div>
                  </div>
                  <div className="course-pricing-preview" aria-live="polite">
                    <div className="course-pricing-preview__header">
                      <span className="course-pricing-preview__label">Student preview</span>
                      <span className="course-pricing-preview__type">{pricingStudentPreview.typeLabel}</span>
                    </div>
                    <div className="course-pricing-preview__value">
                      <span>{pricingStudentPreview.priceLine}</span>
                      {pricingStudentPreview.showOriginal ? (
                        <span className="course-pricing-preview__original">
                          {pricingStudentPreview.currency}{' '}
                          {pricingStudentPreview.original.toLocaleString('en-PK')}
                        </span>
                      ) : null}
                    </div>
                    {pricingStudentPreview.visibilityNotes.length > 0 ? (
                      <ul className="course-pricing-preview__notes">
                        {pricingStudentPreview.visibilityNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  {pricingError ? (
                    <p className="admin-error" role="alert">
                      {pricingError}
                    </p>
                  ) : null}
                  {pricingSuccess ? <p className="admin-success">{pricingSuccess}</p> : null}
                  <div className="course-edit-form__actions">
                    <AdminLoadingButton
                      className="btn--course-primary"
                      type="submit"
                      isLoading={pricingSaving}
                      loadingLabel="Saving…"
                      disabled={Object.keys(pricingErrors).length > 0}
                    >
                      Save pricing
                    </AdminLoadingButton>
                  </div>
                </div>
              )}
            </form>
          )}

          {activeTab === 'subjects' && (
            <div className="course-edit-section course-edit-section--subjects">
              <header className="course-edit-section__header">
                <div>
                  <h2 className="course-edit-section__title">Subjects</h2>
                  <p className="course-edit-section__subtitle">
                    Curriculum units for this course. At least one active subject is required to publish.
                  </p>
                </div>
              </header>
              <div className="course-edit-subjects">
                <AdminCourseSubjectsPanel
                key={courseId}
                token={token}
                courseId={courseId}
                embedded
                onSubjectsChange={(rows) => {
                  setActiveSubjectCount(rows.filter((s) => Boolean(s.isActive)).length);
                }}
                />
              </div>
            </div>
          )}

          {activeTab === 'batch' && (
            <AdminCourseBatchPanel
              token={token}
              courseId={courseId}
              onBatchesChange={setBatches}
              admissionStatus={form.admission_status}
              courseEndDate={form.end_date}
              isFinished={isCourseFinished(form)}
              onAdmissionUpdated={(patch) => {
                setForm((prev) => ({ ...prev, ...patch }));
                onUpdated?.();
              }}
              onCourseFinished={(payload) => {
                const course = payload?.course;
                setForm((prev) => ({
                  ...prev,
                  admission_status: payload?.admission_status || course?.admission_status || 'CLOSED',
                  is_finished: true,
                  finished_at: course?.finished_at ?? payload?.finished_at ?? prev.finished_at,
                }));
                onUpdated?.();
              }}
            />
          )}

          {activeTab === 'notes' && (
            <div className="course-edit-card">
              <AdminCourseNotesPanel token={token} courseId={courseId} />
            </div>
          )}

          {activeTab === 'health' && (
            <div className="course-edit-card course-edit-card--health">
              <CourseHealthPanel
              course={healthSnapshot?.course ?? form}
              pricing={
                healthSnapshot?.pricing ?? {
                  ...pricingForm,
                  price_amount: Number(pricingForm.price_amount),
                }
              }
              batches={healthSnapshot?.batches ?? batches}
              activeSubjectCount={healthSnapshot?.activeSubjectCount ?? activeSubjectCount}
              loading={healthLoading}
              unsavedNotes={healthUnsavedNotes}
              />
            </div>
          )}
        </div>
      </section>

      <aside className="course-edit-aside">
        {activeTab !== 'health' ? (
          <div className="course-edit-aside__card">
            <h3 className="course-edit-aside__title">Quick health</h3>
            <CourseHealthPanel
              course={form}
              pricing={{ ...pricingForm, price_amount: Number(pricingForm.price_amount) }}
              batches={batches}
              activeSubjectCount={activeSubjectCount}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
