/**
 * Client-side course health evaluation for admin UI.
 * Read-only diagnostic — mirrors publish-readiness rules where practical.
 */

const CHECK_SEVERITY = Object.freeze({
  critical: 'critical',
  warning: 'warning',
  ok: 'ok',
});

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

  const activeBatches = (batches || []).filter((b) => b.is_active && b.status !== 'archived');
  if (activeBatches.length === 0) {
    const sev = courseActive ? CHECK_SEVERITY.critical : CHECK_SEVERITY.warning;
    add('NO_ACTIVE_BATCH', sev, 'No active batch is configured for this course.', 'batches');
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
