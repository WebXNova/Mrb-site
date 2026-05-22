import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { courseWizardBodySchema } from '@course-wizard-schema';
import { generateIdempotencyKey } from '../../utils/idempotency.js';
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
  // CRITICAL: Auto-sync publish state
  // If publish=true, force course and pricing to be active
  const publishIntent = Boolean(publish);
  
  const pricingOut = {
    ...pricing,
    price_amount: Math.trunc(Number(pricing.price_amount ?? 0)),
    original_price_amount:
      pricing.original_price_amount === '' || pricing.original_price_amount == null
        ? null
        : Math.trunc(Number(pricing.original_price_amount)),
    // Auto-activate pricing when publishing
    is_active: publishIntent ? true : Boolean(pricing.is_active),
  };
  
  const courseOut = {
    ...course,
    short_description:
      course.short_description == null || String(course.short_description).trim() === ''
        ? null
        : String(course.short_description).trim(),
    thumbnail_url: course.thumbnail_url === undefined ? null : course.thumbnail_url ?? null,
    // Auto-activate course when publishing
    is_active: publishIntent ? true : Boolean(course.is_active),
  };
  const batchesOut = batches
    .filter((b) => String(b.title || '').trim())
    .map((b, index) => {
      const rawStatus = String(b.status || 'draft').toLowerCase();
      
      // Auto-sync batch state when publishing
      let effectiveStatus = rawStatus;
      let effectiveActive = b.is_active !== false;
      
      if (publishIntent) {
        // If publishing and batch is draft, upgrade to upcoming
        if (rawStatus === 'draft') {
          effectiveStatus = 'upcoming';
        }
        // Ensure at least first batch is active when publishing
        if (index === 0 || b.is_active !== false) {
          effectiveActive = true;
        }
      } else {
        // When saving draft, respect original states
        effectiveActive = b.is_active !== false;
      }
      
      return {
        title: String(b.title).trim(),
        start_date: b.start_date,
        end_date: b.end_date,
        enrollment_open_at: b.enrollment_open_at,
        enrollment_close_at: b.enrollment_close_at,
        total_seats: Math.trunc(Number(b.total_seats)),
        instructor_name: (b.instructor_name && String(b.instructor_name).trim()) || null,
        schedule_label: (b.schedule_label && String(b.schedule_label).trim()) || null,
        timezone: b.timezone || 'UTC',
        status: effectiveStatus,
        is_active: effectiveActive,
        allow_enrollment: b.allow_enrollment !== false,
        show_publicly: b.show_publicly !== false,
        certificate_enabled: b.certificate_enabled === true,
        recordings_enabled: b.recordings_enabled !== false,
      };
    });
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
  const abortControllerRef = useRef(null);
  const idempotencyKeyRef = useRef(null);

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
      if (Array.isArray(d.batches) && d.batches.length) {
        // Enforce single-batch invariant when restoring drafts
        setBatches([d.batches[0]]);
      }
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
    // Enforce a single-batch invariant: always update index 0 only
    setBatches((prev) => {
      const base = prev[0] || buildDefaultWizardBatch();
      const next = { ...base, ...(idx === 0 ? patch : {}) };
      return [next];
    });
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

  function handleCancel() {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear draft from local storage
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }

    // Reset wizard state back to initial defaults
    setCourse(buildDefaultWizardCourse());
    setPricing(buildDefaultWizardPricing());
    setBatches([buildDefaultWizardBatch()]);
    setSubjects([buildDefaultWizardSubject()]);
    setStep(0);
    setStepError('');
    setFieldErrors({});
    setBatchFieldErrors({});
    setPublishModalOpen(false);
    setSaving(false);

    // Let parent page react (e.g. clear messages)
    if (typeof onCancel === 'function') {
      onCancel();
    }
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
    // Prevent parallel submissions
    if (saving) {
      return;
    }

    const body = buildWizardPayload(publish, course, pricing, batches, subjects);
    const parsed = courseWizardBodySchema.safeParse(body);
    if (!parsed.success) {
      setStepError(flattenZodError(parsed.error));
      return;
    }

    // Generate idempotency key for this submission
    // Reuse the same key if retrying the same submission
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    // Create abort controller for request cancellation
    abortControllerRef.current = new AbortController();

    setSaving(true);
    setStepError('');
    
    try {
      const res = await adminApi.createCourseWizard(token, parsed.data, {
        idempotencyKey: idempotencyKeyRef.current,
        signal: abortControllerRef.current.signal,
      });
      
      // Clear idempotency key on success
      idempotencyKeyRef.current = null;
      localStorage.removeItem(DRAFT_KEY);
      onCreated(res?.data);
    } catch (err) {
      // Don't show error if request was cancelled
      if (err.name === 'AbortError' || err.name === 'CanceledError') {
        return;
      }
      
      let errorMessage = err.message || 'Wizard submit failed';
      
      // Handle specific error codes
      if (err.response?.data?.error) {
        const errorCode = err.response.data.error.code;
        const errorMsg = err.response.data.error.message;
        const validationErrors = err.response.data.error.validationErrors;
        
        // Domain state errors
        if (errorCode === 'INVALID_PUBLISH_STATE') {
          if (validationErrors && validationErrors.length > 0) {
            errorMessage = validationErrors.map(e => e.message).join('; ');
          } else {
            errorMessage = errorMsg || 'Invalid publish state. Please check all required fields.';
          }
        } else if (errorCode === 'ACTIVE_BATCH_ON_INACTIVE_COURSE') {
          errorMessage = 'Cannot have active batches on an inactive course.';
        } else if (errorCode === 'ACTIVE_PRICING_ON_INACTIVE_COURSE') {
          errorMessage = 'Cannot have active pricing on an inactive course.';
        } else if (errorCode === 'INVALID_BATCH_LIFECYCLE') {
          errorMessage = errorMsg || 'Batch enrollment windows or dates are invalid.';
        }
        // Duplicate entry errors
        else if (errorCode === 'BATCH_CODE_EXISTS') {
          errorMessage = errorMsg || 'A batch with this code already exists in this course.';
        } else if (errorCode === 'COURSE_TITLE_EXISTS') {
          errorMessage = errorMsg || 'A course with this title already exists.';
        }
        // Idempotency errors
        else if (errorCode === 'IDEMPOTENCY_KEY_MISMATCH') {
          errorMessage = 'This submission was modified. Please review and resubmit.';
          idempotencyKeyRef.current = null;
        }
        // Generic fallback
        else if (errorMsg) {
          errorMessage = errorMsg;
        }
      }
      
      setStepError(errorMessage);
    } finally {
      setSaving(false);
      setPublishModalOpen(false);
      abortControllerRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear draft timer
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, []);

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
            onCancel={handleCancel}
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
            <button type="button" className="btn btn--ghost btn--sm" onClick={handleCancel}>
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
