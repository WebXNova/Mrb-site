import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { courseWizardBodySchema } from '@course-wizard-schema';
import { generateIdempotencyKey } from '../../utils/idempotency.js';
import { useAdminToast } from '../context/AdminToastContext';
import CourseWizardProgress from '../components/courses/CourseWizardProgress';
import CourseLivePreviewPanel from '../components/courses/CourseLivePreviewPanel';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
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
  sanitizeWizardBatch,
} from './courseWizardDefaults.js';
import {
  validateDetailsStep,
  validatePricingStep,
  validateBatchesStep,
  validateAdmissionStep,
  validateSubjectsStep,
  flattenZodError,
} from './courseWizardStepsValidation.js';
import { toDateInputValue } from './courseScheduleValidation.js';

const LEGACY_DRAFT_KEY = 'mrb_admin_course_create_wizard_v1';
const WIZARD_LAST_STEP = 4;

/** Map legacy 6-step drafts (schedule at index 1) onto 5-step flow. */
function normalizeWizardDraftStep(step) {
  if (typeof step !== 'number' || step < 0) return 0;
  if (step === 1) return 2;
  if (step >= 2 && step <= 5) return step - 1;
  return Math.min(WIZARD_LAST_STEP, step);
}

function applyDraftState(d, setters) {
  if (!d || typeof d !== 'object') return;
  const { setCourse, setPricing, setBatches, setSubjects, setStep } = setters;
  if (d.course) setCourse(d.course);
  if (d.pricing) setPricing(d.pricing);
  if (Array.isArray(d.batches) && d.batches.length) {
    setBatches([sanitizeWizardBatch(d.batches[0])]);
  }
  if (Array.isArray(d.subjects) && d.subjects.length) setSubjects(d.subjects);
  if (typeof d.step === 'number') setStep(normalizeWizardDraftStep(d.step));
}

function normalizeBatchStatusForPublish(rawStatus) {
  const status = String(rawStatus || 'draft').toLowerCase();
  if (status === 'draft') return 'published';
  if (status === 'published') return 'published';
  return 'published';
}

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
  
  const batchesOut = batches
    .filter((b) => String(b.title || '').trim())
    .map((b, index) => {
      const rawStatus = String(b.status || 'draft').toLowerCase();
      let effectiveStatus = rawStatus;
      let effectiveActive = b.is_active !== false;

      if (publishIntent) {
        effectiveStatus = normalizeBatchStatusForPublish(rawStatus);
        if (index === 0 || b.is_active !== false) {
          effectiveActive = true;
        }
      } else {
        effectiveActive = b.is_active !== false;
      }

      return {
        title: String(b.title).trim(),
        start_date: b.start_date,
        end_date: b.end_date,
        total_seats: Math.trunc(Number(b.total_seats)),
        seats_fantasy: Math.trunc(Number(b.seats_fantasy ?? 0)),
        instructor_name: (b.instructor_name && String(b.instructor_name).trim()) || null,
        schedule_label: (b.schedule_label && String(b.schedule_label).trim()) || null,
        timezone: b.timezone || 'UTC',
        status: effectiveStatus,
        is_active: effectiveActive,
        show_publicly: b.show_publicly !== false,
        recordings_enabled: b.recordings_enabled !== false,
      };
    });
  const primaryBatch = batchesOut[0];
  const courseOut = {
    ...course,
    short_description:
      course.short_description == null || String(course.short_description).trim() === ''
        ? null
        : String(course.short_description).trim(),
    thumbnail_url: course.thumbnail_url === undefined ? null : course.thumbnail_url ?? null,
    start_date: primaryBatch
      ? toDateInputValue(primaryBatch.start_date) || null
      : toDateInputValue(course.start_date) || null,
    end_date: primaryBatch
      ? toDateInputValue(primaryBatch.end_date) || null
      : toDateInputValue(course.end_date) || null,
    admission_status: course.admission_status || 'CLOSED',
    // Auto-activate course when publishing
    is_active: publishIntent ? true : Boolean(course.is_active),
  };
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
  const toast = useAdminToast();
  const [step, setStep] = useState(0);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
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
  const [draftHydrated, setDraftHydrated] = useState(false);
  const imageInputRef = useRef(null);
  const draftTimerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const idempotencyKeyRef = useRef(null);

  const clearServerDraft = useCallback(async () => {
    if (!token) return;
    try {
      await adminApi.saveCourseDraft(token, { clear: true });
    } catch {
      /* ignore */
    }
  }, [token]);

  const persistDraft = useCallback(async () => {
    if (!token || !draftHydrated) return;
    try {
      const payload = {
        course,
        pricing,
        batches: batches.map((batch) => sanitizeWizardBatch(batch)),
        subjects,
        step,
      };
      const response = await adminApi.saveCourseDraft(token, payload);
      const updatedAt = response?.data?.updatedAt;
      setDraftSavedAt(updatedAt ? new Date(updatedAt).getTime() : Date.now());
    } catch {
      /* ignore */
    }
  }, [token, draftHydrated, course, pricing, batches, subjects, step]);

  const hasDraftContent =
    Boolean(course.title?.trim()) ||
    Boolean(course.description?.trim()) ||
    Boolean(course.thumbnail_url);

  useEffect(() => {
    function onBeforeUnload(event) {
      if (!hasDraftContent) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDraftContent]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDraft() {
      setDraftHydrated(false);

      if (!token) {
        setDraftHydrated(true);
        return;
      }

      try {
        const response = await adminApi.loadCourseDraft(token);
        if (cancelled) return;

        const draft = response?.data?.draft;
        if (draft) {
          applyDraftState(draft, { setCourse, setPricing, setBatches, setSubjects, setStep });
          if (response?.data?.updatedAt) {
            setDraftSavedAt(new Date(response.data.updatedAt).getTime());
          }
        } else {
          try {
            const raw = localStorage.getItem(LEGACY_DRAFT_KEY);
            if (raw) {
              const legacyDraft = JSON.parse(raw);
              applyDraftState(legacyDraft, { setCourse, setPricing, setBatches, setSubjects, setStep });
              localStorage.removeItem(LEGACY_DRAFT_KEY);
              await adminApi.saveCourseDraft(token, legacyDraft);
              setDraftSavedAt(Date.now());
            }
          } catch {
            /* ignore legacy migration failures */
          }
        }
      } catch {
        /* ignore load failures — wizard starts fresh */
      } finally {
        if (!cancelled) setDraftHydrated(true);
      }
    }

    hydrateDraft();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!draftHydrated) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      persistDraft();
    }, 500);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [persistDraft, draftHydrated]);

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
      const base = sanitizeWizardBatch(prev[0] || buildDefaultWizardBatch());
      const next = sanitizeWizardBatch({ ...base, ...(idx === 0 ? patch : {}) });
      return [next];
    });
    if (patch.start_date !== undefined || patch.end_date !== undefined) {
      setCourse((c) => ({
        ...c,
        start_date:
          patch.start_date !== undefined ? toDateInputValue(patch.start_date) || null : c.start_date,
        end_date: patch.end_date !== undefined ? toDateInputValue(patch.end_date) || null : c.end_date,
      }));
    }
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

  function resetWizardState() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    void clearServerDraft();
    setCourse(buildDefaultWizardCourse());
    setPricing(buildDefaultWizardPricing());
    setBatches([buildDefaultWizardBatch()]);
    setSubjects([buildDefaultWizardSubject()]);
    setStep(0);
    setStepError('');
    setFieldErrors({});
    setBatchFieldErrors({});
    setPublishModalOpen(false);
    setExitConfirmOpen(false);
    setSaving(false);
    setDraftSavedAt(null);
  }

  function handleCancel() {
    resetWizardState();
    if (typeof onCancel === 'function') onCancel();
  }

  function requestExit() {
    if (hasDraftContent) {
      setExitConfirmOpen(true);
      return;
    }
    handleCancel();
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
      const admission = validateAdmissionStep(course);
      if (!admission.success) {
        setFieldErrors(admission.errors || {});
        setStepError(admission.message || 'Invalid admission status');
        return;
      }
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
    setStep((s) => Math.min(WIZARD_LAST_STEP, s + 1));
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
      try {
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      await clearServerDraft();
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
      toast.error(errorMessage);
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

  const wizardFooter =
    step < WIZARD_LAST_STEP ? (
      <>
        <button type="button" className="btn--course-secondary" disabled={step === 0} onClick={goBack}>
          Back
        </button>
        <button type="button" className="btn--course-primary" onClick={goNext}>
          Continue
        </button>
        <button type="button" className="btn--course-secondary" onClick={requestExit}>
          Cancel
        </button>
      </>
    ) : null;

  return (
    <div className="admin-courses-workspace admin-courses-workspace--wizard">
      <div className="admin-courses-wizard-shell">
        <div className="admin-courses-wizard-shell__header">
          <h2 className="admin-courses-wizard-shell__title">Create course</h2>
          <p className="admin-courses-wizard-shell__subtitle">
            Guided workflow with autosave — your draft is stored securely in this browser.
          </p>
          {draftSavedAt ? (
            <p className="admin-courses-wizard-shell__autosave" aria-live="polite">
              <span className="admin-courses-wizard-shell__autosave-dot" aria-hidden />
              Draft saved {new Date(draftSavedAt).toLocaleTimeString()}
            </p>
          ) : null}
        </div>

        <CourseWizardProgress stepIndex={step} />

        {stepError ? (
          <div className="premium-field__error" role="alert" style={{ margin: '0 var(--space-6)', paddingTop: 'var(--space-4)' }}>
            {stepError}
          </div>
        ) : null}

        <CourseWizardLayout footer={wizardFooter}>
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
              course={course}
              onCourseChange={onCourseChange}
              batches={batches}
              onBatchChange={onBatchChange}
              fieldErrors={fieldErrors}
              batchFieldErrors={batchFieldErrors}
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
              onCancel={requestExit}
            />
          ) : null}
        </CourseWizardLayout>
      </div>

      <CourseLivePreviewPanel course={course} pricing={pricing} stepIndex={step} />

      <AdminConfirmDialog
        open={publishModalOpen}
        title="Publish course?"
        message="This creates the course, pricing, batch, and subjects in one transaction and makes them available based on your visibility settings."
        confirmLabel="Confirm publish"
        busy={saving}
        onConfirm={() => submitWizard(true)}
        onCancel={() => setPublishModalOpen(false)}
      />

      <AdminConfirmDialog
        open={exitConfirmOpen}
        title="Discard unsaved draft?"
        message="Your course draft will be cleared from your account. This cannot be undone."
        confirmLabel="Discard draft"
        danger
        onConfirm={handleCancel}
        onCancel={() => setExitConfirmOpen(false)}
      />
    </div>
  );
}
