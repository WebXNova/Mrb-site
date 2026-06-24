import { ApiError } from '../utils/apiError.js';

/**
 * Draft/Publish Lifecycle Validation Service
 * 
 * Validates that a course meets all requirements before publishing.
 * Prevents published courses with invalid/incomplete data.
 * 
 * Lifecycle flow:
 * DRAFT → validate completeness → PUBLISHED → immutable rules
 */

/**
 * Validate that a course meets publish requirements
 * 
 * @param {object} payload - Course wizard payload
 * @throws {ApiError} if validation fails
 */
export function validatePublishRequirements(payload) {
  const errors = [];

  // Course must have thumbnail
  const thumbnail = payload.course?.thumbnail_url;
  if (!thumbnail || String(thumbnail).trim() === '') {
    errors.push({
      field: 'course.thumbnail_url',
      message: 'Thumbnail is required to publish a course',
    });
  }

  // Course must have adequate description
  const description = payload.course?.description;
  if (!description || String(description).trim().length < 30) {
    errors.push({
      field: 'course.description',
      message: 'Course description must be at least 30 characters to publish',
    });
  }

  // Must have at least one batch
  if (!payload.batches || payload.batches.length === 0) {
    errors.push({
      field: 'batches',
      message: 'At least one batch is required to publish a course',
    });
  }

  // Must have at least one subject
  if (!payload.subjects || payload.subjects.length === 0) {
    errors.push({
      field: 'subjects',
      message: 'At least one subject is required to publish a course',
    });
  }

  // Pricing must be configured properly
  if (!payload.pricing) {
    errors.push({
      field: 'pricing',
      message: 'Pricing information is required to publish a course',
    });
  } else {
    // For paid courses, ensure pricing is reasonable
    if (payload.pricing.pricing_type !== 'free') {
      if (!payload.pricing.price_amount || payload.pricing.price_amount <= 0) {
        errors.push({
          field: 'pricing.price_amount',
          message: 'Price amount must be greater than 0 for paid courses',
        });
      }
    }
  }

  // All batches must have valid schedules
  if (payload.batches) {
    payload.batches.forEach((batch, index) => {
      if (!batch.start_date || !batch.end_date) {
        errors.push({
          field: `batches[${index}]`,
          message: `Batch ${index + 1} must have start and end dates`,
        });
      }

      if (!batch.total_seats || batch.total_seats <= 0) {
        errors.push({
          field: `batches[${index}]`,
          message: `Batch ${index + 1} must have at least 1 seat`,
        });
      }
    });
  }

  // All subjects must have titles
  if (payload.subjects) {
    payload.subjects.forEach((subject, index) => {
      if (!subject.title || String(subject.title).trim() === '') {
        errors.push({
          field: `subjects[${index}]`,
          message: `Subject ${index + 1} must have a title`,
        });
      }
    });
  }

  if (errors.length > 0) {
    throw new ApiError(422, 'Course does not meet publish requirements', {
      code: 'PUBLISH_VALIDATION_FAILED',
      validationErrors: errors,
    });
  }
}

/**
 * Validate lifecycle transition rules
 * 
 * @param {string} currentStatus - Current course status
 * @param {string} newStatus - Desired new status
 * @param {object} context - Additional context; `privilegedRecoverArchivedCourse` when caller allows LMS admin-equivalent recovery (admin or super_admin).
 */
export function validateCourseLifecycleTransition(currentStatus, newStatus, context = {}) {
  const current = String(currentStatus || 'draft').toLowerCase();
  const next = String(newStatus || 'draft').toLowerCase();

  if (current === next) {
    return; // No transition
  }

  const allowedTransitions = {
    draft: ['published', 'archived'],
    published: ['archived'],
    archived: [], // Immutable
  };

  const allowed = allowedTransitions[current] || [];

  if (!allowed.includes(next)) {
    // LMS admin-equivalent roles (admin, super_admin): recover archived → draft — set `privilegedRecoverArchivedCourse` via isAdminRole() at call sites when wiring.
    if (
      context.privilegedRecoverArchivedCourse &&
      current === 'archived' &&
      next === 'draft'
    ) {
      return;
    }

    throw new ApiError(409, `Cannot transition course from ${current} to ${next}`, {
      code: 'INVALID_LIFECYCLE_TRANSITION',
      details: { from: current, to: next },
    });
  }
}
