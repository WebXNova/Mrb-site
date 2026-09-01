/**
 * Canonical standalone open/close + schedule decision matrix.
 *
 * Open/Closed (`access_mode`) and the start/end window are independent gates.
 * Course-linked tests must not use this module for listing or start eligibility.
 *
 * Start authorization still goes through:
 *   assertFreeStandaloneTestAccess / assertPaidStandaloneTestAccess
 * Those services compose this snapshot with payment, seats, and attempt limits.
 */

import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';
import { isStandaloneAccessType } from '../validators/testAccessType.js';
import { isFreeStandaloneExamOpen } from '../security/cee/freeStandaloneAccess.service.js';
import { isPaidStandaloneExamOpen } from '../security/cee/paidStandaloneAccess.service.js';
import { shouldEnforceScheduleWindow } from '../security/cee/courseLinkedTestAccess.service.js';
import { evaluateTestAvailabilityWindow, toAvailabilityIso } from './testAvailabilityWindow.service.js';

export const STANDALONE_LISTING_STATUS = Object.freeze({
  CLOSED: 'closed',
  UPCOMING: 'upcoming',
  LIVE: 'live',
  EXPIRED: 'expired',
});

export const STANDALONE_SCHEDULE_PHASE = Object.freeze({
  UNSCHEDULED: 'unscheduled',
  UPCOMING: 'upcoming',
  LIVE: 'live',
  EXPIRED: 'expired',
});

/**
 * Active student catalog SQL: published, not deleted, standalone, not past end.
 * Closed (`access_mode = private`) tests remain listed.
 */
export const STANDALONE_ACTIVE_CATALOG_WHERE_SQL = `
  AND t.status = 'published'
  AND t.deleted_at IS NULL
  AND t.course_id IS NULL
  AND (t.end_date IS NULL OR t.end_date > UTC_TIMESTAMP())`;

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function isStandaloneExamOpen(testRow) {
  if (isFreeStandaloneExamOpen(testRow)) return true;
  if (isPaidStandaloneExamOpen(testRow)) return true;
  return false;
}

/**
 * @param {ReturnType<typeof evaluateTestAvailabilityWindow>} availability
 */
export function schedulePhaseFromAvailability(availability) {
  if (!availability) return STANDALONE_SCHEDULE_PHASE.UNSCHEDULED;
  if (availability.noLongerAvailable) return STANDALONE_SCHEDULE_PHASE.EXPIRED;
  if (availability.notYetAvailable) return STANDALONE_SCHEDULE_PHASE.UPCOMING;
  if (availability.startDate == null && availability.endDate == null) {
    return STANDALONE_SCHEDULE_PHASE.UNSCHEDULED;
  }
  return STANDALONE_SCHEDULE_PHASE.LIVE;
}

/**
 * Decision matrix (standalone only):
 *
 * CLOSED + before start  → visible, not startable, CLOSED
 * OPEN   + before start  → visible, not startable, UPCOMING
 * OPEN   + inside window → visible, startable, LIVE
 * CLOSED + inside window → visible, not startable, CLOSED
 * OPEN   + after end     → not in active list, not startable, EXPIRED
 * CLOSED + after end     → not in active list, not startable, EXPIRED
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {number} nowMs
 */
export function evaluateStandaloneRuntimeState(testRow, nowMs) {
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('evaluateStandaloneRuntimeState requires a finite nowMs from getAvailabilityNowMs');
  }

  const availability = evaluateTestAvailabilityWindow(testRow, nowMs);
  const standalone = isStandaloneAccessType(testRow?.test_access_type);
  const published = String(testRow?.status || '') === 'published' && testRow?.deleted_at == null;
  const examOpen = isStandaloneExamOpen(testRow);
  const schedulePhase = schedulePhaseFromAvailability(availability);
  const expired = availability.noLongerAvailable === true;
  const upcoming = availability.notYetAvailable === true;
  const insideWindow = availability.insideWindow === true;

  let listingStatus = STANDALONE_LISTING_STATUS.CLOSED;
  if (expired) {
    listingStatus = STANDALONE_LISTING_STATUS.EXPIRED;
  } else if (!examOpen) {
    listingStatus = STANDALONE_LISTING_STATUS.CLOSED;
  } else if (upcoming) {
    listingStatus = STANDALONE_LISTING_STATUS.UPCOMING;
  } else {
    listingStatus = STANDALONE_LISTING_STATUS.LIVE;
  }

  const listedInActiveCatalog = Boolean(standalone && published && !expired);
  const canCreateAttemptByOpenAndWindow = Boolean(
    standalone && examOpen && insideWindow && shouldEnforceScheduleWindow(testRow)
  );

  return {
    applies: standalone,
    examOpen,
    published,
    schedulePhase,
    listingStatus,
    listedInActiveCatalog,
    canCreateAttemptByOpenAndWindow,
    upcoming,
    expired,
    insideWindow,
    startDate: availability.startDate,
    endDate: availability.endDate,
    availability,
  };
}

/**
 * Catalog/public payload fields derived from the canonical snapshot.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {number} nowMs
 */
export function presentStandaloneCatalogRuntime(testRow, nowMs) {
  const runtime = evaluateStandaloneRuntimeState(testRow, nowMs);
  return {
    startDate: toAvailabilityIso(testRow?.start_date) ?? runtime.startDate,
    endDate: toAvailabilityIso(testRow?.end_date) ?? runtime.endDate,
    examOpen: runtime.examOpen,
    listingStatus: runtime.listingStatus,
    schedulePhase: runtime.schedulePhase,
    canCreateAttempt: runtime.canCreateAttemptByOpenAndWindow,
  };
}

/**
 * Reject new public/catalog access after the window ends.
 * In-progress attempts must not use this — they use IN_PROGRESS window rules.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {number} nowMs
 * @param {{ slug?: string, context?: string }} [options]
 */
export function assertStandaloneActiveCatalogAccess(testRow, nowMs, options = {}) {
  const runtime = evaluateStandaloneRuntimeState(testRow, nowMs);
  if (runtime.listedInActiveCatalog) return runtime;

  const testId = testRow?.id ?? testRow?.test_id ?? null;
  if (runtime.expired) {
    throw new TestNotAccessibleError({
      testId,
      slug: options.slug ?? testRow?.public_slug ?? null,
      reason: 'test_no_longer_available',
      endDate: runtime.endDate,
      context: options.context ?? 'assertStandaloneActiveCatalogAccess',
    });
  }

  throw new TestNotAccessibleError({
    testId,
    slug: options.slug ?? testRow?.public_slug ?? null,
    reason: String(testRow?.test_access_type || '').includes('paid')
      ? 'paid_standalone_not_found'
      : 'free_standalone_not_found',
    context: options.context ?? 'assertStandaloneActiveCatalogAccess',
  });
}
