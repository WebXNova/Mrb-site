import { isStandaloneAccessType } from '../constants/testAccessType.js';
import { isTestPublishedStatus } from './testBasicInfoValidation.js';

export const TEST_ACCESS_TYPE_LABELS = Object.freeze({
  course_locked: 'Course-linked',
  free_standalone: 'Free standalone',
  paid_standalone: 'Paid standalone',
});

export function formatTestAccessTypeLabel(value) {
  const key = String(value || 'course_locked').trim();
  return TEST_ACCESS_TYPE_LABELS[key] || 'Course-linked';
}

export function formatAdminDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isoToDatetimeLocalValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

export function getStandaloneSeatSummary(test) {
  const capacity = Number(test?.seatCapacity ?? test?.seat_capacity ?? 0);
  const confirmed = Number(test?.confirmedSeats ?? test?.confirmed_seats ?? 0);
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { capacity: 0, confirmed, remaining: null, configured: false };
  }
  return {
    capacity,
    confirmed,
    remaining: Math.max(0, capacity - confirmed),
    configured: true,
  };
}

/**
 * Availability for admin badges. Course-linked tests never use start/end dates.
 * Open/Closed is a separate control — this returns the schedule (and seat-full) state.
 */
export function getTestAvailabilityState(test, nowMs = Date.now()) {
  if (!isTestPublishedStatus(test?.status)) return null;

  const accessMode = String(test?.accessMode ?? test?.access_mode ?? 'private').toLowerCase();
  const standalone = isStandaloneAccessType(test?.testAccessType ?? test?.test_access_type);
  const seats = getStandaloneSeatSummary(test);

  if (standalone && seats.configured && seats.remaining === 0) return 'full';

  if (standalone) {
    const start = test?.startDate ?? test?.start_date;
    const end = test?.endDate ?? test?.end_date;
    const startMs = start ? new Date(start).getTime() : null;
    const endMs = end ? new Date(end).getTime() : null;
    if (Number.isFinite(startMs) && nowMs < startMs) return 'scheduled';
    if (Number.isFinite(endMs) && nowMs >= endMs) return 'ended';
    return 'live';
  }

  if (accessMode !== 'public') {
    return 'private';
  }

  return 'live';
}

export function getTestOpenClosedState(test) {
  const accessMode = String(test?.accessMode ?? test?.access_mode ?? 'private').toLowerCase();
  return accessMode === 'public' ? 'open' : 'closed';
}

export function formatAvailabilityLabel(state) {
  switch (state) {
    case 'scheduled':
      return 'Scheduled';
    case 'live':
      return 'Live';
    case 'ended':
      return 'Ended';
    case 'full':
      return 'Full';
    case 'closed':
      return 'Exam closed';
    case 'private':
      return 'Admin only';
    default:
      return '';
  }
}

export function getResultsReleaseState(test) {
  const releasedAt = test?.resultsReleasedAt ?? test?.results_released_at ?? null;
  if (releasedAt) return 'published';
  const scores = Number(test?.scoresCount ?? test?.scores_count ?? 0);
  if (scores > 0) return 'pending';
  return 'none';
}

export function formatResultsReleaseLabel(state) {
  if (state === 'published') return 'Results published';
  if (state === 'pending') return 'Results pending';
  return '';
}

export function formatCourseLabel(test) {
  const title = String(test?.courseTitle ?? test?.course_title ?? '').trim();
  if (title) return title;
  const id = test?.courseId ?? test?.course_id;
  if (id != null && Number(id) > 0) return `Course #${id}`;
  return '—';
}

export function formatSeatInventoryLine(test) {
  const seats = getStandaloneSeatSummary(test);
  if (!seats.configured) return 'Seats not limited';
  return `${seats.capacity.toLocaleString()} total · ${seats.confirmed.toLocaleString()} used · ${seats.remaining.toLocaleString()} remaining`;
}

export function formatSeatShort(test) {
  const seats = getStandaloneSeatSummary(test);
  if (!seats.configured) return '—';
  return `${seats.remaining.toLocaleString()} / ${seats.capacity.toLocaleString()}`;
}

export function formatScheduleWindow(test) {
  if (!isStandaloneAccessType(test?.testAccessType ?? test?.test_access_type)) return '';
  const start = formatAdminDateTime(test?.startDate ?? test?.start_date);
  const end = formatAdminDateTime(test?.endDate ?? test?.end_date);
  if (start === '—' && end === '—') return 'Schedule not set';
  return `${start} – ${end}`;
}

export function formatPkrAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `Rs. ${n.toLocaleString('en-PK')}`;
}

/**
 * Backend-accurate access-mode copy. Public never means anyone can take the test.
 */
export function getAccessModeOptionCopy(accessType, accessMode) {
  const type = String(accessType || 'course_locked');
  const mode = accessMode === 'public' ? 'public' : 'private';

  if (type === 'paid_standalone') {
    if (mode === 'public') {
      return {
        label: 'Open exam — approved seated students may start',
        hint:
          'Opening the exam is separate from payment approval. Only students with a confirmed seat can start, and only while this test is published and inside the availability window.',
      };
    }
    return {
      label: 'Closed — approved students cannot start yet',
      hint:
        'Payment approval confirms a seat. It does not open the exam. Keep this closed until you are ready for seated students to start.',
    };
  }

  if (type === 'free_standalone') {
    if (mode === 'public') {
      return {
        label: 'Open exam during the availability window',
        hint:
          'This stores the exam as open for the free standalone path. Students still cannot start unless the test is published and inside the start/end window. Published free tests remain visible in the student catalog even when closed.',
      };
    }
    return {
      label: 'Closed — students cannot start yet',
      hint:
        'The test stays visible in the student catalog. Students cannot start until you switch to Open and the schedule window is active.',
    };
  }

  if (mode === 'public') {
    return {
      label: 'Public — enrolled students of the assigned course',
      hint:
        'The test information can be publicly visible, but only students actively enrolled in the assigned course can start/access the test. Public never means anyone can take the test.',
    };
  }

  return {
    label: 'Private — admin only',
    hint:
      'Only administrators can view this test. Students cannot see or start it while Private is selected. After you switch to Public, only students actively enrolled in the assigned course can view and start the test.',
  };
}
