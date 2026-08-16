/**
 * Client-side course health evaluation for admin UI.
 * Read-only diagnostic — mirrors publish-readiness rules where practical.
 */

import { parseSavedBool } from './parseSavedBool.js';

const CHECK_SEVERITY = Object.freeze({
  critical: 'critical',
  warning: 'warning',
  ok: 'ok',
});

/**
 * @param {Array<object>} batches
 */
function resolvePrimaryBatch(batches) {
  const list = batches || [];
  return (
    list.find((b) => parseSavedBool(b.is_active, false) && String(b.status || '').toLowerCase() !== 'archived') ||
    list.find((b) => String(b.status || '').toLowerCase() !== 'archived') ||
    list[0] ||
    null
  );
}

/**
 * @param {object} input
 * @param {object} input.course
 * @param {object|null} input.pricing
 * @param {Array<object>} input.batches
 * @param {number} input.activeSubjectCount
 */
export function evaluateCourseHealth({ course, pricing, batches, activeSubjectCount }) {
  const checks = [];
  const courseActive = Boolean(course?.is_active);
  const title = String(course?.title ?? '').trim();
  const description = String(course?.description ?? '').trim();
  const thumbnail = String(course?.thumbnail_url ?? '').trim();
  const admissionStatus = String(course?.admission_status || 'CLOSED').toUpperCase();

  function add(code, severity, message, field) {
    checks.push({ code, severity, message, field });
  }

  if (!title) {
    add('TITLE_MISSING', CHECK_SEVERITY.critical, 'Course title is required.', 'title');
  }

  if (!description) {
    add('DESCRIPTION_MISSING', CHECK_SEVERITY.critical, 'Course description is required.', 'description');
  } else if (description.length < 30) {
    add(
      'DESCRIPTION_TOO_SHORT',
      CHECK_SEVERITY.warning,
      'Description should be at least 30 characters to publish.',
      'description'
    );
  }

  if (!thumbnail) {
    add('THUMBNAIL_MISSING', CHECK_SEVERITY.critical, 'A course thumbnail is required.', 'thumbnail_url');
  }

  const hasActivePricing = Boolean(pricing?.is_active);
  if (!hasActivePricing) {
    const sev = courseActive ? CHECK_SEVERITY.critical : CHECK_SEVERITY.warning;
    add('NO_ACTIVE_PRICING', sev, 'No active pricing row is configured.', 'pricing');
  } else if (pricing?.pricing_type !== 'free' && Number(pricing?.price_amount) <= 0) {
    add('INVALID_PRICING_AMOUNT', CHECK_SEVERITY.critical, 'Paid courses need a price greater than 0.', 'pricing.price_amount');
  }

  const activeBatches = (batches || []).filter(
    (b) => parseSavedBool(b.is_active, false) && String(b.status || '').toLowerCase() !== 'archived'
  );
  if (activeBatches.length === 0) {
    const sev = courseActive ? CHECK_SEVERITY.critical : CHECK_SEVERITY.warning;
    add('NO_ACTIVE_BATCH', sev, 'No active batch is configured for this course.', 'batches');
  }

  const primaryBatch = resolvePrimaryBatch(batches);
  if (primaryBatch) {
    const totalSeats = Number(primaryBatch.total_seats ?? 0);
    if (!Number.isFinite(totalSeats) || totalSeats < 1) {
      const sev = courseActive ? CHECK_SEVERITY.critical : CHECK_SEVERITY.warning;
      add('BATCH_NO_SEATS', sev, 'Batch must have at least 1 total seat configured.', 'batches.total_seats');
    }

    const batchActive =
      parseSavedBool(primaryBatch.is_active, true) &&
      String(primaryBatch.status || '').toLowerCase() !== 'archived';

    if (batchActive && !parseSavedBool(primaryBatch.show_publicly, true)) {
      add(
        'BATCH_NOT_PUBLIC',
        CHECK_SEVERITY.warning,
        'Active batch is hidden from public listings (show publicly is off).',
        'batches.show_publicly'
      );
    }

    if (batchActive && !parseSavedBool(primaryBatch.recordings_enabled, true)) {
      add(
        'BATCH_RECORDINGS_OFF',
        CHECK_SEVERITY.warning,
        'Recordings are disabled for the active batch.',
        'batches.recordings_enabled'
      );
    }

    const batchStatus = String(primaryBatch.status || '').toLowerCase();
    if (courseActive && batchStatus === 'published' && admissionStatus === 'CLOSED') {
      add(
        'ADMISSION_CLOSED',
        CHECK_SEVERITY.warning,
        'Admission is closed — new enrollments are blocked despite a published batch.',
        'admission_status'
      );
    }
  }

  if (activeSubjectCount < 1) {
    const sev = courseActive ? CHECK_SEVERITY.critical : CHECK_SEVERITY.warning;
    add('NO_SUBJECTS', sev, 'At least one active subject is required.', 'subjects');
  }

  if (!courseActive) {
    add('COURSE_INACTIVE', CHECK_SEVERITY.warning, 'Course is inactive and hidden from the public catalog.', 'is_active');
  }

  const criticalCount = checks.filter((c) => c.severity === CHECK_SEVERITY.critical).length;
  const warningCount = checks.filter((c) => c.severity === CHECK_SEVERITY.warning).length;
  const healthyCount = checks.filter((c) => c.severity === CHECK_SEVERITY.ok).length;

  let status = 'healthy';
  if (criticalCount > 0) status = 'critical';
  else if (warningCount > 0) status = 'warning';

  return {
    status,
    checks,
    summary: { critical_count: criticalCount, warning_count: warningCount, healthy_count: healthyCount },
  };
}

export function courseHealthStatusLabel(status) {
  if (status === 'critical') return 'Critical';
  if (status === 'warning') return 'Warning';
  return 'Healthy';
}

export function courseHealthStatusClass(status) {
  if (status === 'critical') return 'course-health-badge--critical';
  if (status === 'warning') return 'course-health-badge--warning';
  return 'course-health-badge--healthy';
}

/**
 * Compare live edit forms against a saved DB snapshot for Health tab notices.
 * @param {{ course?: object, pricing?: object }|null} saved
 * @param {{ form: object, pricingForm: object }} live
 */
export function buildUnsavedHealthNotes(saved, { form, pricingForm }) {
  if (!saved?.course) return [];

  const notes = [];
  const generalFields = ['title', 'description', 'short_description', 'level', 'thumbnail_url', 'is_active'];
  const generalDirty = generalFields.some((key) => {
    const a = form?.[key];
    const b = saved.course?.[key];
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) !== Boolean(b);
    return String(a ?? '') !== String(b ?? '');
  });
  if (generalDirty) {
    notes.push('General tab has unsaved changes — save there to refresh these checks.');
  }

  const pricingFields = [
    'pricing_type',
    'price_amount',
    'original_price_amount',
    'currency_code',
    'is_active',
    'enrollment_visible',
    'public_purchase_visible',
  ];
  const pricingDirty = pricingFields.some((key) => {
    const a = pricingForm?.[key];
    const b = saved.pricing?.[key];
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) !== Boolean(b);
    return String(a ?? '') !== String(b ?? '');
  });
  if (pricingDirty) {
    notes.push('Pricing tab has unsaved changes — save there to refresh these checks.');
  }

  return notes;
}
