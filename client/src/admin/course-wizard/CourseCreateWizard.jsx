import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { courseWizardBodySchema } from '@course-wizard-schema';
import CourseWizardLayout from './CourseWizardLayout.jsx';
import CourseStepDetails from './CourseStepDetails.jsx';
import CourseStepPricing from './CourseStepPricing.jsx';
import CourseStepBatches from './CourseStepBatches.jsx';
import CourseStepSubjects from './CourseStepSubjects.jsx';
import CourseStepReview from './CourseStepReview.jsx';
import {
  buildDefaultWizardBatch,
  buildDefaultWizardCourse,
  buildDefaultWizardPricing,
  buildDefaultWizardSubject,
} from './courseWizardDefaults.js';
import {
  validateDetailsStep,
  validatePricingStep,
  validateBatchesStep,
  validateSubjectsStep,
  flattenZodError,
} from './courseWizardStepsValidation.js';

const DRAFT_KEY = 'mrb_admin_course_create_wizard_v1';

function buildWizardPayload(publish, course, pricing, batches, subjects) {
  const pricingOut = {
    ...pricing,
    price_amount: Math.trunc(Number(pricing.price_amount ?? 0)),
    original_price_amount:
      pricing.original_price_amount === '' || pricing.original_price_amount == null
        ? null
        : Math.trunc(Number(pricing.original_price_amount)),
  };
  const courseOut = {
    ...course,
    short_description:
      course.short_description == null || String(course.short_description).trim() === ''
        ? null
        : String(course.short_description).trim(),
    thumbnail_url: course.thumbnail_url === undefined ? null : course.thumbnail_url ?? null,
  };
  const batchesOut = batches
    .filter((b) => String(b.title || '').trim())
    .map((b) => ({
      ...b,
      title: String(b.title).trim(),
      code: b.code ? String(b.code).trim() : undefined,
      instructor_name: (b.instructor_name && String(b.instructor_name).trim()) || null,
      schedule_label: (b.schedule_label && String(b.schedule_label).trim()) || null,
      total_seats: Math.trunc(Number(b.total_seats)),
    }));
  const subjectsOut = subjects
    .filter((s) => String(s.title || '').trim())
    .map((s, i) => ({
      title: String(s.title).trim(),
      description: s.description == null || String(s.description).trim() === '' ? null : String(s.description).trim(),
      order_index: i,
    }));
  return { publish, course: courseOut, pricing: pricingOut, batches: batchesOut, subjects: subjectsOut };
}

export default function CourseCreateWizard({ token, onCreated, onCancel }) {
  const [step, setStep] = useState(0);
  const [course, setCourse] = useState(() => buildDefaultWizardCourse());
  const [pricing, setPricing] = useState(() => buildDefaultWizardPricing());
  const [batches, setBatches] = useState(() => [buildDefaultWizardBatch()]);
  const [subjects, setSubjects] = useState(() => [buildDefaultWizardSubject()]);
  const [stepError, setStepError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [batchFieldErrors, setBatchFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef(null);
  const draftTimerRef = useRef(null);

  const persistDraft = useCallback(() => {
    try {
      const payload = { course, pricing, batches, subjects, step };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [course, pricing, batches, subjects, step]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.course) setCourse(d.course);
      if (d.pricing) setPricing(d.pricing);
      if (Array.isArray(d.batches) && d.batches.length) setBatches(d.batches);
      if (Array.isArray(d.subjects) && d.subjects.length) setSubjects(d.subjects);
      if (typeof d.step === 'number' && d.step >= 0 && d.step <= 4) setStep(d.step);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => persistDraft(), 500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [persistDraft]);

  const titleLen = String(course.title || '').length;
  const shortDescriptionLen = String(course.short_description ?? '').length;
  const descriptionLen = String(course.description || '').length;

  function onCourseChange(e) {
    const { name, value, type, checked } = e.target;
    setCourse((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function onPricingChange(e) {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setPricing((p) => ({ ...p, [name]: checked }));
      return;
    }
    if (name === 'price_amount') {
      setPricing((p) => ({ ...p, price_amount: value === '' ? 0 : Math.trunc(Number(value)) }));
      return;
    }
    if (name === 'original_price_amount') {
      setPricing((p) => ({
        ...p,
        original_price_amount: value === '' ? null : Math.trunc(Number(value)),
      }));
      return;
    }
    if (name === 'pricing_type') {
      setPricing((p) => ({
        ...p,
        pricing_type: value,
        price_amount: value === 'free' ? 0 : p.price_amount,
        original_price_amount: value === 'free' ? null : p.original_price_amount,
      }));
      return;
    }
    setPricing((p) => ({ ...p, [name]: value }));
  }

  function onBatchChange(idx, patch) {
    setBatches((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  function onAddBatch() {
    setBatches((prev) => [...prev, buildDefaultWizardBatch()]);
  }

  function onRemoveBatch(idx) {
    setBatches((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function onSubjectChange(idx, patch) {
    setSubjects((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function onAddSubject() {
    setSubjects((prev) => [...prev, { ...buildDefaultWizardSubject(), order_index: prev.length }]);
  }

  function onRemoveSubject(idx) {
    setSubjects((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function onMoveSubject(idx, delta) {
    setSubjects((prev) => {
      const j = idx + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((s, i) => ({ ...s, order_index: i }));
    });
  }

  async function onImageFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    setStepError('');
    try {
      const response = await adminApi.uploadCourseImage(token, file);
      const url = response?.data?.url;
      if (!url) throw new Error('Image upload returned no URL');
      setCourse((prev) => ({ ...prev, thumbnail_url: url }));
    } catch (err) {
      setStepError(err.message || 'Failed to upload image');
      if (imageInputRef.current) imageInputRef.current.value = '';
    } finally {
      setImageUploading(false);
    }
  }

  function clearCoverImage() {
    setCourse((prev) => ({ ...prev, thumbnail_url: undefined }));
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function goNext() {
    setStepError('');
    setFieldErrors({});
    setBatchFieldErrors({});
    if (step === 0) {
      const r = validateDetailsStep(course);
      if (!r.success) {
        const fe = {};
        for (const iss of r.error.errors) {
          const p = iss.path[0];
          if (p) fe[p] = iss.message;
        }
        setFieldErrors(fe);
        setStepError(flattenZodError(r.error));
        return;
      }
    }
    if (step === 1) {
      const r = validatePricingStep(pricing);
      if (!r.success) {
        setStepError(flattenZodError(r.error));
        return;
      }
    }
    if (step === 2) {
      const r = validateBatchesStep(batches);
      if (!r.success) {
        const be = {};
        if (r.index != null) be[r.index] = flattenZodError(r.error);
        setBatchFieldErrors(be);
        setStepError(r.index != null ? `Batch ${r.index + 1}: ${flattenZodError(r.error)}` : 'Invalid batches');
        return;
      }
    }
    if (step === 3) {
      const r = validateSubjectsStep(subjects);
      if (!r.success) {
        if (r.duplicateTitle) {
          setStepError('Duplicate subject titles are not allowed.');
        } else {
          setStepError(
            r.index != null ? `Subject ${r.index + 1}: ${flattenZodError(r.error)}` : flattenZodError(r.error)
          );
        }
        return;
      }
    }
    setStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    setStepError('');
    setStep((s) => Math.max(0, s - 1));
  }

  const reviewWarnings = (() => {
    const body = buildWizardPayload(true, course, pricing, batches, subjects);
    const r = courseWizardBodySchema.safeParse(body);
    if (r.success) return [];
    const msgs = [];
    for (const iss of r.error.errors) {
      msgs.push(iss.message);
    }
    return Array.from(new Set(msgs)).slice(0, 8);
  })();

  async function submitWizard(publish) {
    const body = buildWizardPayload(publish, course, pricing, batches, subjects);
    const parsed = courseWizardBodySchema.safeParse(body);
    if (!parsed.success) {
      setStepError(flattenZodError(parsed.error));
      return;
    }
    setSaving(true);
    setStepError('');
    try {
      const res = await adminApi.createCourseWizard(token, parsed.data);
      localStorage.removeItem(DRAFT_KEY);
      onCreated(res?.data);
    } catch (err) {
      setStepError(err.message || 'Wizard submit failed');
    } finally {
      setSaving(false);
      setPublishModalOpen(false);
    }
  }

  const previewCard =
    step === 0 ? (
      <div className="admin-card" style={{ padding: '1rem' }}>
        <h4 className="heading-4" style={{ marginTop: 0 }}>
          Live preview
        </h4>
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt=""
            style={{ width: '100%', borderRadius: '8px', marginBottom: '0.75rem' }}
          />
        ) : null}
        <div style={{ fontWeight: 600 }}>{course.title || 'Course title'}</div>
        <div className="admin-courses__muted" style={{ fontSize: 'var(--fs-13)', marginTop: '0.35rem' }}>
          {course.level}
        </div>
        {course.short_description ? (
          <p className="admin-courses__muted" style={{ marginTop: '0.5rem' }}>
            {course.short_description}
          </p>
        ) : null}
        <p className="admin-courses__muted" style={{ marginTop: '0.5rem', fontSize: 'var(--fs-13)' }}>
          {(course.description || '').slice(0, 220)}
          {(course.description || '').length > 220 ? '…' : ''}
        </p>
      </div>
    ) : null;

  return (
    <div className="admin-card admin-courses__card">
      <h2 className="heading-3">Create course</h2>
      <p className="admin-courses__muted">Guided workflow — draft is saved in this browser.</p>
      {stepError ? (
        <div className="admin-field__error" role="alert" style={{ marginTop: '0.75rem' }}>
          {stepError}
        </div>
      ) : null}
      <CourseWizardLayout stepIndex={step} preview={previewCard}>
        {step === 0 ? (
          <CourseStepDetails
            course={course}
            onChange={onCourseChange}
            titleLen={titleLen}
            shortDescriptionLen={shortDescriptionLen}
            descriptionLen={descriptionLen}
            fieldErrors={fieldErrors}
            imageUploading={imageUploading}
            imageInputRef={imageInputRef}
            onImageChange={onImageFileChange}
            onClearImage={clearCoverImage}
          />
        ) : null}
        {step === 1 ? (
          <CourseStepPricing pricing={pricing} onChange={onPricingChange} fieldErrors={{}} />
        ) : null}
        {step === 2 ? (
          <CourseStepBatches
            batches={batches}
            onBatchChange={onBatchChange}
            onAddBatch={onAddBatch}
            onRemoveBatch={onRemoveBatch}
            fieldErrors={batchFieldErrors}
          />
        ) : null}
        {step === 3 ? (
          <CourseStepSubjects
            subjects={subjects}
            onSubjectChange={onSubjectChange}
            onAdd={onAddSubject}
            onRemove={onRemoveSubject}
            onMove={onMoveSubject}
          />
        ) : null}
        {step === 4 ? (
          <CourseStepReview
            course={course}
            pricing={pricing}
            batches={batches}
            subjects={subjects}
            warnings={reviewWarnings}
            saving={saving}
            onSaveDraft={() => submitWizard(false)}
            onOpenPublishModal={() => setPublishModalOpen(true)}
            onCancel={onCancel}
          />
        ) : null}
        {step < 4 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn--ghost btn--sm" disabled={step === 0} onClick={goBack}>
              Back
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={goNext}>
              Next
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
              Exit wizard
            </button>
          </div>
        ) : null}
      </CourseWizardLayout>
      {publishModalOpen ? (
        <div className="admin-course-wizard-modal" role="dialog" aria-modal="true" aria-labelledby="wiz_pub_title">
          <div className="admin-course-wizard-modal__panel admin-card">
            <h3 id="wiz_pub_title" className="heading-3">
              Publish course?
            </h3>
            <p className="admin-courses__muted">This creates the course, pricing, batches, and subjects in one transaction.</p>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn--primary" disabled={saving} onClick={() => submitWizard(true)}>
                Confirm publish
              </button>
              <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setPublishModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
