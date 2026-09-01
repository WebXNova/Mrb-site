import { TEST_ACCESS_MODES } from './testSettingsValidation.js';
import { selectCompletableScoreBands, validateScoreBandsClient } from './testScoreBandValidation.js';
import { datetimeLocalToIso, isoToDatetimeLocalValue } from './testAdminDisplay.js';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import {
  canonicalizeDisplayMode,
  layoutModeFromDisplay,
  resolveAuthoritativeDisplay,
  resolveFullPageMode,
} from '../../utils/testPresentation.js';

export const UNLIMITED_DURATION_SENTINEL = 600;
/** Longest server-enforced exam duration. The UI must not call this "unlimited". */
export const MAX_DURATION_MINUTES = 600;
export const UNLIMITED_ATTEMPTS_SENTINEL = 0;

export const defaultTestSettingsPageForm = {
  title: '',
  introduction_html: '',
  display_mode: 'all',
  shuffle_questions: false,
  shuffle_options: false,
  conclusion_html: '',
  show_result_immediately: true,
  show_explanations: true,
  show_score: true,
  show_test_outline: true,
  show_correct_incorrect: true,
  show_correct_answer: true,
  access_mode: 'private',
  duration_minutes: '60',
  attempts_unlimited: false,
  max_attempts: '1',
  passing_marks: '0',
  negative_marking: '0',
  full_page_mode: false,
  score_bands: [],
  test_access_type: 'course_locked',
  price_pkr: '500',
  seat_capacity: '100',
  confirmed_seats: 0,
  start_date: '',
  end_date: '',
};

/**
 * Fold obsolete vertical/horizontal drafts into display_mode.
 * @param {Record<string, unknown>|null|undefined} form
 */
export function canonicalizeTestSettingsPageForm(form) {
  const next = { ...(form || {}) };
  next.display_mode = resolveAuthoritativeDisplay(next);
  next.full_page_mode = resolveFullPageMode(next);
  delete next.layout_mode;
  return next;
}

/**
 * @param {{ settings?: Record<string, unknown>, rules?: Record<string, unknown> }} data
 */
export function mapApiToTestSettingsPageForm(data) {
  const settings = data.settings ?? {};
  const rules = data.rules ?? {};
  const durationMinutes = Number(rules.duration_minutes ?? 60);
  const maxAttempts = Number(rules.max_attempts ?? 1);

  return {
    title: String(settings.title ?? ''),
    introduction_html: String(settings.introduction_html ?? ''),
    display_mode: resolveAuthoritativeDisplay(settings),
    shuffle_questions: Boolean(settings.shuffle_questions),
    shuffle_options: Boolean(settings.shuffle_options),
    conclusion_html: String(settings.conclusion_html ?? ''),
    show_result_immediately: settings.show_result_immediately !== false,
    show_explanations: Boolean(Number(settings.show_explanations ?? 1)),
    show_score: settings.show_result_immediately !== false,
    show_test_outline: Boolean(Number(settings.show_answers_after_submit)),
    show_correct_incorrect: Boolean(Number(settings.show_answers_after_submit)),
    show_correct_answer: Boolean(Number(settings.show_answers_after_submit)),
    access_mode: settings.access_mode === 'public' ? 'public' : 'private',
    duration_minutes: String(Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60),
    attempts_unlimited: maxAttempts <= UNLIMITED_ATTEMPTS_SENTINEL,
    max_attempts: maxAttempts <= UNLIMITED_ATTEMPTS_SENTINEL ? '1' : String(maxAttempts),
    passing_marks: rules.passing_marks == null ? '0' : String(rules.passing_marks),
    negative_marking: String(rules.negative_marking ?? 0),
    full_page_mode: resolveFullPageMode(settings),
    score_bands: Array.isArray(settings.score_bands)
      ? settings.score_bands.map((band, index) => ({
          clientId: `band-${band.id ?? index}`,
          id: band.id,
          min_score: String(band.min_score ?? ''),
          max_score: String(band.max_score ?? ''),
          message_html: String(band.message_html ?? ''),
          display_order: band.display_order ?? index,
        }))
      : [],
    results_released_at: settings.results_released_at ?? null,
    test_access_type: String(settings.test_access_type ?? 'course_locked'),
    price_pkr: String(settings.price_pkr ?? 500),
    seat_capacity: String(settings.seat_capacity ?? 0),
    confirmed_seats: Number(settings.confirmed_seats ?? 0),
    start_date: isoToDatetimeLocalValue(settings.start_date),
    end_date: isoToDatetimeLocalValue(settings.end_date),
  };
}

/**
 * @param {typeof defaultTestSettingsPageForm} form
 * @param {{ passing_marks?: number, negative_marking?: number, totalMarks?: number|null }} [rulesSnapshot]
 */
function isWholeNumberInRange(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && Math.floor(n) === n && n >= min && n <= max;
}

export function validateTestSettingsPageForm(form, rulesSnapshot = {}) {
  const errors = {};
  form = canonicalizeTestSettingsPageForm(form);

  const title = String(form.title ?? '').trim();
  if (title.length < 3) {
    errors.title = 'Test name must be at least 3 characters.';
  }
  if (title.length > 120) {
    errors.title = 'Test name must not exceed 120 characters.';
  }

  if (!TEST_ACCESS_MODES.includes(form.access_mode)) {
    errors.access_mode = 'Access mode must be public or private.';
  }

  if (form.display_mode !== 'all' && form.display_mode !== 'one_per_page') {
    errors.display_mode = 'Question display must be all questions or one question per page.';
  }

  const duration = Number(form.duration_minutes);
  if (!isWholeNumberInRange(duration, 1, 600)) {
    errors.duration_minutes = 'Duration must be between 1 and 600 minutes (10 hours maximum).';
  }

  if (!form.attempts_unlimited) {
    const attempts = Number(form.max_attempts);
    if (!isWholeNumberInRange(attempts, 1, 50)) {
      errors.max_attempts = 'Attempt limit must be between 1 and 50.';
    }
  }

  const passingMarks = Number(form.passing_marks ?? rulesSnapshot.passing_marks ?? 0);
  if (!Number.isFinite(passingMarks) || passingMarks < 0) {
    errors.passing_marks = 'Passing marks must be 0 or greater.';
  } else {
    const totalMarks = Number(rulesSnapshot.totalMarks);
    if (Number.isFinite(totalMarks) && totalMarks > 0 && passingMarks > totalMarks) {
      errors.passing_marks = `Passing marks cannot exceed total marks (${totalMarks}).`;
    }
  }

  const negativeMarking = Number(form.negative_marking ?? rulesSnapshot.negative_marking ?? 0);
  if (!Number.isFinite(negativeMarking) || negativeMarking < 0 || negativeMarking > 1) {
    errors.negative_marking = 'Negative marking must be between 0 and 1.';
  }

  if (form.test_access_type === 'paid_standalone') {
    const priceRaw = String(form.price_pkr ?? '').trim();
    const price = Number(form.price_pkr);
    if (priceRaw !== '' && priceRaw !== '0' && (!Number.isInteger(price) || price < 1)) {
      errors.price_pkr = 'Paid tests require a price of at least Rs. 1 (stored on the server).';
    }
    const capacityRaw = String(form.seat_capacity ?? '').trim();
    const capacity = Number(form.seat_capacity);
    if (capacityRaw !== '' && capacityRaw !== '0' && (!Number.isInteger(capacity) || capacity < 1)) {
      errors.seat_capacity = 'Seat capacity must be at least 1.';
    }
  } else if (form.test_access_type === 'free_standalone' && String(form.seat_capacity ?? '').trim() !== '') {
    const capacity = Number(form.seat_capacity);
    if (!Number.isInteger(capacity) || capacity < 0) {
      errors.seat_capacity = 'Seat capacity must be 0 or greater. Use 0 if you are not limiting seats.';
    }
  }

  if (isStandaloneAccessType(form.test_access_type)) {
    const startIso = form.start_date ? datetimeLocalToIso(form.start_date) : '';
    const endIso = form.end_date ? datetimeLocalToIso(form.end_date) : '';
    if (form.start_date && !startIso) {
      errors.start_date = 'Enter a valid start date and time.';
    }
    if (form.end_date && !endIso) {
      errors.end_date = 'Enter a valid end date and time.';
    }
    if (startIso && endIso && new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      errors.end_date = 'End date and time must be after the start.';
    }
  }

  const bandErrors = validateScoreBandsClient(form.score_bands);
  if (bandErrors.length) {
    errors.score_bands = bandErrors.join(' ');
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  const showResults = Boolean(form.show_result_immediately && form.show_score);
  const showOutline =
    showResults &&
    (Boolean(form.show_test_outline) ||
      Boolean(form.show_correct_incorrect) ||
      Boolean(form.show_correct_answer));

  return {
    ok: true,
    basicInfoPayload: {
      title,
    },
    settingsPayload: {
      introduction_html: form.introduction_html || null,
      conclusion_html: form.conclusion_html || null,
      display_mode: canonicalizeDisplayMode(form.display_mode),
      layout_mode: layoutModeFromDisplay(form.display_mode),
      shuffle_questions: Boolean(form.shuffle_questions),
      shuffle_options: Boolean(form.shuffle_options),
      show_explanations: Boolean(form.show_explanations && form.show_score),
      show_result_immediately: showResults,
      show_answers_after_submit: showOutline,
      access_mode: form.access_mode,
      full_page_mode: Boolean(form.full_page_mode),
      ...(isStandaloneAccessType(form.test_access_type)
        ? {
            start_date: form.start_date ? datetimeLocalToIso(form.start_date) || null : null,
            end_date: form.end_date ? datetimeLocalToIso(form.end_date) || null : null,
            ...(form.test_access_type === 'paid_standalone'
              ? {
                  ...(Number(form.price_pkr) >= 1 ? { price_pkr: Number(form.price_pkr) } : {}),
                  ...(Number(form.seat_capacity) >= 1 ? { seat_capacity: Number(form.seat_capacity) } : {}),
                }
              : { seat_capacity: Number(form.seat_capacity || 0) }),
          }
        : {}),
      score_bands: selectCompletableScoreBands(form.score_bands).map((band, index) => ({
        id: band.id,
        min_score: Number(band.min_score),
        max_score: Number(band.max_score),
        message_html: band.message_html,
        display_order: index,
      })),
    },
    rulesPayload: {
      duration_minutes: duration,
      max_attempts: form.attempts_unlimited ? UNLIMITED_ATTEMPTS_SENTINEL : Number(form.max_attempts),
      passing_marks: passingMarks,
      negative_marking: negativeMarking,
    },
  };
}
