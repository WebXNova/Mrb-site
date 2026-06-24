import { ApiError } from '../utils/apiError.js';
import { validateBatchScheduleWindow } from '../utils/batchDateTime.js';
import { normalizeBatchStatusForPublish } from './courseBatch.service.js';

/**
 * Centralized Publish State Resolver
 * 
 * INVARIANTS:
 * 1. If publish=true → course MUST be active
 * 2. If publish=true → at least one batch MUST be active
 * 3. If publish=true → pricing MUST be active
 * 4. Inactive course CANNOT have active batches
 * 5. Inactive course CANNOT have active pricing
 */

/**
 * Resolve effective publish state from wizard payload
 * 
 * @param {object} payload - Validated wizard payload
 * @returns {object} Resolved state with enforced invariants
 */
export function resolveWizardPublishState(payload) {
  const publishIntent = Boolean(payload.publish);
  
  // RULE 1: If publish=true, course MUST be active; draft → force inactive
  const courseActive = publishIntent ? true : false;
  
  // RULE 2: If publish=true, pricing MUST be active; draft → force inactive
  const pricingActive = publishIntent ? true : false;
  
  // RULE 3: Process batches with publish-aware defaults
  const batches = (payload.batches || []).map(batch => {
    const rawStatus = String(batch.status || 'draft').toLowerCase();
    const effectiveStatus = publishIntent ? normalizeBatchStatusForPublish(rawStatus) : rawStatus;
    
    // If publishing, at least first batch should be active; draft => inactive
    const effectiveActive = publishIntent ? true : false;
    
    return {
      ...batch,
      status: effectiveStatus,
      is_active: effectiveActive,
    };
  });
  
  return {
    publish: publishIntent,
    courseActive,
    pricingActive,
    batches,
  };
}

/**
 * Validate domain invariants BEFORE transaction begins
 * 
 * @param {object} payload - Wizard payload
 * @param {object} resolved - Resolved publish state
 * @throws {ApiError} if invariants are violated
 */
export function validatePublishStateInvariants(payload, resolved) {
  const errors = [];
  
  // INVARIANT 1: Active course cannot have zero active batches
  if (resolved.courseActive) {
    const activeBatches = resolved.batches.filter(b => b.is_active !== false);
    if (activeBatches.length === 0 && resolved.batches.length > 0) {
      errors.push({
        code: 'ACTIVE_COURSE_REQUIRES_ACTIVE_BATCH',
        message: 'Active courses must have at least one active batch',
        field: 'batches',
      });
    }
  }
  
  // INVARIANT 2: Inactive course cannot have active batches
  if (!resolved.courseActive) {
    const activeBatches = resolved.batches.filter(b => b.is_active !== false);
    if (activeBatches.length > 0) {
      errors.push({
        code: 'ACTIVE_BATCH_ON_INACTIVE_COURSE',
        message: 'Inactive courses cannot have active batches',
        field: 'course.is_active',
        details: { activeBatchCount: activeBatches.length },
      });
    }
  }
  
  // INVARIANT 3: Inactive course cannot have active pricing
  if (!resolved.courseActive && resolved.pricingActive) {
    errors.push({
      code: 'ACTIVE_PRICING_ON_INACTIVE_COURSE',
      message: 'Inactive courses cannot have active pricing',
      field: 'pricing.is_active',
    });
  }
  
  // INVARIANT 4: Published courses must have required content
  if (resolved.publish) {
    if (!payload.subjects || payload.subjects.length === 0) {
      errors.push({
        code: 'PUBLISH_REQUIRES_SUBJECTS',
        message: 'Published courses must have at least one subject',
        field: 'subjects',
      });
    }
    
    if (!resolved.batches || resolved.batches.length === 0) {
      errors.push({
        code: 'PUBLISH_REQUIRES_BATCHES',
        message: 'Published courses must have at least one batch',
        field: 'batches',
      });
    }
    
    if (!payload.course?.thumbnail_url || String(payload.course.thumbnail_url).trim() === '') {
      errors.push({
        code: 'PUBLISH_REQUIRES_THUMBNAIL',
        message: 'Published courses must have a thumbnail',
        field: 'course.thumbnail_url',
      });
    }
  }
  
  // INVARIANT 5: Batch enrollment windows must be valid
  for (let i = 0; i < resolved.batches.length; i++) {
    const batch = resolved.batches[i];
    const scheduleCheck = validateBatchScheduleWindow(batch);

    if (!scheduleCheck.ok) {
      errors.push({
        code: 'INVALID_BATCH_LIFECYCLE',
        message: `Batch ${i + 1}: ${scheduleCheck.message}`,
        field: `batches[${i}].${scheduleCheck.field ?? 'start_date'}`,
      });
    }
  }
  
  if (errors.length > 0) {
    throw new ApiError(422, 'Domain state validation failed', {
      code: 'INVALID_PUBLISH_STATE',
      validationErrors: errors,
    });
  }
}

/**
 * Generate audit log metadata for publish operations
 * 
 * @param {object} resolved - Resolved publish state
 * @returns {object} Audit metadata
 */
export function generatePublishAuditMetadata(resolved) {
  const activeBatchCount = resolved.batches.filter(b => b.is_active !== false).length;
  const inactiveBatchCount = resolved.batches.length - activeBatchCount;
  
  return {
    publishMode: resolved.publish ? 'publish' : 'draft',
    courseActive: resolved.courseActive,
    pricingActive: resolved.pricingActive,
    totalBatches: resolved.batches.length,
    activeBatches: activeBatchCount,
    inactiveBatches: inactiveBatchCount,
    batchStatuses: resolved.batches.map(b => b.status),
  };
}
