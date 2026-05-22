import { ApiError } from '../utils/apiError.js';

/**
 * Course Wizard State Resolver
 * 
 * CRITICAL: Single source of truth for publish state consistency.
 * Ensures ZERO contradictory states between publish intent, course active state,
 * batch active state, and pricing active state.
 * 
 * INVARIANTS (enforced permanently):
 * 1. publish=true → course MUST be active
 * 2. inactive course → NO active batches allowed
 * 3. inactive course → NO active pricing allowed
 * 4. publish=true → at least 1 active batch required
 * 5. publish=true → active pricing required
 */

/**
 * Resolve and validate wizard publish state consistency
 * 
 * @param {object} payload - Validated wizard payload
 * @returns {object} { courseActive, pricingActive, batchesEffective, errors }
 */
export function resolveWizardPublishState(payload) {
  const publish = Boolean(payload.publish);
  const errors = [];
  
  // RULE 1: If publish=true, course MUST be active (override client value)
  let courseActive;
  if (publish) {
    courseActive = true; // FORCE active on publish
    
    // Warn if client sent contradictory value
    if (payload.course.is_active === false) {
      console.warn('[wizardState] Client sent publish=true with is_active=false. Forcing active.');
    }
  } else {
    // Draft mode: respect client value or default to false
    courseActive = Boolean(payload.course.is_active);
  }
  
  // RULE 2: Resolve pricing active state
  let pricingActive;
  if (publish) {
    pricingActive = true; // Published courses need active pricing
    
    if (payload.pricing?.is_active === false) {
      errors.push({
        code: 'ACTIVE_PRICING_ON_INACTIVE_COURSE',
        field: 'pricing.is_active',
        message: 'Published courses require active pricing',
      });
    }
  } else {
    // Draft: allow inactive pricing
    pricingActive = Boolean(payload.pricing?.is_active);
  }
  
  // RULE 3: Resolve batch states
  const batchesEffective = payload.batches.map((batch, index) => {
    const batchWantsActive = batch.is_active !== false;
    const rawStatus = String(batch.status || 'draft').toLowerCase();
    
    let effectiveActive;
    let effectiveStatus;
    
    if (publish) {
      // Published course: upgrade draft batches to upcoming, keep them active
      effectiveActive = true;
      effectiveStatus = rawStatus === 'draft' ? 'upcoming' : rawStatus;
    } else {
      // Draft course: batches can be inactive
      effectiveActive = courseActive ? batchWantsActive : false;
      effectiveStatus = rawStatus;
      
      // Validate: inactive course cannot have active batches
      if (!courseActive && batchWantsActive) {
        errors.push({
          code: 'ACTIVE_BATCH_ON_INACTIVE_COURSE',
          field: `batches[${index}].is_active`,
          message: `Batch ${index + 1}: Cannot create active batch for inactive course`,
        });
      }
    }
    
    return {
      ...batch,
      is_active: effectiveActive,
      status: effectiveStatus,
    };
  });
  
  // RULE 4: Published courses must have at least one batch
  if (publish && batchesEffective.length === 0) {
    errors.push({
      code: 'INVALID_PUBLISH_STATE',
      field: 'batches',
      message: 'Published courses must have at least one batch',
    });
  }
  
  // RULE 5: Published courses must have active batches
  const hasActiveBatch = batchesEffective.some((b) => b.is_active);
  if (publish && !hasActiveBatch) {
    errors.push({
      code: 'INVALID_PUBLISH_STATE',
      field: 'batches',
      message: 'Published courses must have at least one active batch',
    });
  }
  
  return {
    courseActive,
    pricingActive,
    batchesEffective,
    errors,
  };
}

/**
 * Pre-validate wizard state BEFORE transaction
 * 
 * @param {object} payload - Validated wizard payload
 * @throws {ApiError} if state is invalid
 */
export function validateWizardStateConsistency(payload) {
  const resolved = resolveWizardPublishState(payload);
  
  if (resolved.errors.length > 0) {
    throw new ApiError(422, 'Invalid wizard state consistency', {
      code: 'INVALID_PUBLISH_STATE',
      validationErrors: resolved.errors,
    });
  }
  
  // Additional domain validations
  const errors = [];
  
  // Validate batch enrollment windows
  for (let i = 0; i < payload.batches.length; i++) {
    const batch = payload.batches[i];
    
    const enrollStart = Date.parse(batch.enrollment_open_at);
    const enrollClose = Date.parse(batch.enrollment_close_at);
    const batchStart = Date.parse(`${batch.start_date}T00:00:00.000Z`);
    const batchEnd = Date.parse(`${batch.end_date}T23:59:59.999Z`);
    
    if (enrollStart >= enrollClose) {
      errors.push({
        code: 'INVALID_BATCH_LIFECYCLE',
        field: `batches[${i}].enrollment_close_at`,
        message: `Batch ${i + 1}: Enrollment close must be after enrollment open`,
      });
    }
    
    if (enrollClose >= batchStart) {
      errors.push({
        code: 'INVALID_BATCH_LIFECYCLE',
        field: `batches[${i}].enrollment_close_at`,
        message: `Batch ${i + 1}: Enrollment must close before batch starts`,
      });
    }
    
    if (batchStart >= batchEnd) {
      errors.push({
        code: 'INVALID_BATCH_LIFECYCLE',
        field: `batches[${i}].end_date`,
        message: `Batch ${i + 1}: Batch end date must be after start date`,
      });
    }
    
    if (batch.total_seats <= 0) {
      errors.push({
        code: 'INVALID_BATCH_LIFECYCLE',
        field: `batches[${i}].total_seats`,
        message: `Batch ${i + 1}: Total seats must be greater than 0`,
      });
    }
  }
  
  // Validate subjects for published courses
  if (payload.publish && payload.subjects.length === 0) {
    errors.push({
      code: 'INVALID_PUBLISH_STATE',
      field: 'subjects',
      message: 'Published courses must have at least one subject',
    });
  }
  
  if (errors.length > 0) {
    throw new ApiError(422, 'Wizard state validation failed', {
      code: 'INVALID_WIZARD_STATE',
      validationErrors: errors,
    });
  }
  
  return resolved;
}
