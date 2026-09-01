/**
 * Per-student catalog CTA — uses the existing retake policy.
 * Does not remove tests from the public catalog.
 */

import { evaluateRetakePolicy } from './testRetakePolicy.service.js';
import { isStudentResultVisible } from './testResultVisibility.service.js';

export const EMPTY_STANDALONE_ATTEMPT_STATS = Object.freeze({
  totalAttempts: 0,
  hasActiveAttempt: false,
  hasCompletedAttempt: false,
  activeAttemptId: null,
  latestCompletedAttemptId: null,
});

/**
 * @param {{
 *   kind: 'free' | 'paid',
 *   hasActiveAttempt: boolean,
 *   hasCompletedAttempt: boolean,
 *   canResumeActive: boolean,
 *   canCreateNew: boolean,
 *   catalogOpen: boolean,
 *   resultVisible: boolean,
 * }} input
 */
export function deriveStandaloneCatalogStudentAction(input) {
  const kind = input.kind === 'paid' ? 'paid' : 'free';
  const hasActiveAttempt = Boolean(input.hasActiveAttempt);
  const hasCompletedAttempt = Boolean(input.hasCompletedAttempt);
  const canResumeActive = Boolean(input.canResumeActive);
  const canCreateNew = Boolean(input.canCreateNew);
  const canStartNow = Boolean(input.canStartNow ?? input.catalogOpen);
  const canRegister = Boolean(input.canRegister ?? (kind === 'paid' && canStartNow));
  const catalogOpen = canStartNow;
  const resultVisible = Boolean(input.resultVisible);

  if (hasActiveAttempt && canResumeActive) {
    return {
      action: 'continue',
      ctaLabel: 'Continue Test',
      availabilityLabel: 'In progress',
      availabilityTone: 'open',
    };
  }

  if (hasCompletedAttempt && !canCreateNew) {
    return resultVisible
      ? {
          action: 'view_details',
          ctaLabel: 'View Details',
          availabilityLabel: 'Completed',
          availabilityTone: 'completed',
        }
      : {
          action: 'view_status',
          ctaLabel: 'View Status',
          availabilityLabel: 'Results pending',
          availabilityTone: 'pending',
        };
  }

  if (hasCompletedAttempt && canCreateNew && !catalogOpen) {
    return resultVisible
      ? {
          action: 'view_details',
          ctaLabel: 'View Details',
          availabilityLabel: 'Completed',
          availabilityTone: 'completed',
        }
      : {
          action: 'view_status',
          ctaLabel: 'View Status',
          availabilityLabel: 'Results pending',
          availabilityTone: 'pending',
        };
  }

  if (kind === 'paid' && !hasCompletedAttempt && canCreateNew && canRegister) {
    return {
      action: 'register',
      ctaLabel: 'Register for Test',
      availabilityLabel: null,
      availabilityTone: null,
    };
  }

  if (canStartNow && canCreateNew) {
    return {
      action: 'start',
      ctaLabel: 'Start Test',
      availabilityLabel: hasCompletedAttempt ? 'Retake open' : null,
      availabilityTone: hasCompletedAttempt ? 'open' : null,
    };
  }

  return {
    action: 'view',
    ctaLabel: 'View details',
    availabilityLabel: null,
    availabilityTone: null,
  };
}

function seatsAvailable(row, kind) {
  const capacity = Number(row?.seat_capacity || 0);
  if (capacity <= 0) return true;
  if (kind === 'paid') {
    return Number(row?.confirmed_seats || 0) < capacity;
  }
  return Number(row?.occupied_seats || 0) < capacity;
}

function listingStatusFromItem(item) {
  if (item?.listingStatus) return String(item.listingStatus);
  if (item?.examOpen) return 'live';
  return 'closed';
}

/**
 * @param {{
 *   kind: 'free' | 'paid',
 *   item: Record<string, unknown>,
 *   row: Record<string, unknown>,
 *   stats?: typeof EMPTY_STANDALONE_ATTEMPT_STATS,
 * }} input
 */
export function mapStandaloneCatalogStudentState(input) {
  const kind = input.kind === 'paid' ? 'paid' : 'free';
  const stats = input.stats || EMPTY_STANDALONE_ATTEMPT_STATS;
  const retake = evaluateRetakePolicy(
    { max_attempts: input.row?.max_attempts },
    {
      totalAttempts: stats.totalAttempts,
      hasActiveAttempt: stats.hasActiveAttempt,
    }
  );
  const listingStatus = listingStatusFromItem(input.item);
  const seatsOk = seatsAvailable(input.row, kind);
  const catalogStartable = listingStatus === 'live' && seatsOk;
  const catalogRegisterable = kind === 'paid' && listingStatus !== 'expired' && seatsOk;

  const derived = deriveStandaloneCatalogStudentAction({
    kind,
    hasActiveAttempt: stats.hasActiveAttempt,
    hasCompletedAttempt: stats.hasCompletedAttempt,
    canResumeActive: retake.canResumeActive,
    canCreateNew: retake.canCreateNew,
    catalogOpen: catalogStartable,
    canStartNow: catalogStartable,
    canRegister: catalogRegisterable,
    resultVisible: isStudentResultVisible(input.row),
  });

  let attemptId = null;
  if (derived.action === 'continue') {
    attemptId = stats.activeAttemptId ?? null;
  } else if (derived.action === 'view_details' || derived.action === 'view_status') {
    attemptId = stats.latestCompletedAttemptId ?? null;
  }

  return {
    action: derived.action,
    ctaLabel: derived.ctaLabel,
    availabilityLabel: derived.availabilityLabel,
    availabilityTone: derived.availabilityTone,
    canCreateNew: retake.canCreateNew,
    canResume: retake.canResumeActive,
    attemptId,
    resultAvailable: Boolean(isStudentResultVisible(input.row) && stats.hasCompletedAttempt),
  };
}
