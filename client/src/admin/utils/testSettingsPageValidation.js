import { TEST_ACCESS_MODES } from './testSettingsValidation';
import { validateScoreBandsClient } from './testScoreBandValidation';

export const UNLIMITED_DURATION_SENTINEL = 600;
export const UNLIMITED_ATTEMPTS_SENTINEL = 0;

export const defaultTestSettingsPageForm = {
  title: '',
  introduction_html: '',
  display_mode: 'all',
  layout_mode: 'vertical',
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
  duration_unlimited: false,
  duration_minutes: '60',
  attempts_unlimited: false,
  max_attempts: '1',
  full_page_mode: false,
  score_bands: [],
};

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
    display_mode: settings.display_mode === 'one_per_page' ? 'one_per_page' : 'all',
    layout_mode: settings.layout_mode === 'horizontal' ? 'horizontal' : 'vertical',
    shuffle_questions: Boolean(settings.shuffle_questions),
    shuffle_options: Boolean(settings.shuffle_options),
    conclusion_html: String(settings.conclusion_html ?? ''),
    show_result_immediately: settings.show_result_immediately !== false,
    show_explanations: settings.show_explanations !== false,
    show_score: settings.show_result_immediately !== false,
    show_test_outline: settings.show_answers_after_submit !== false && settings.show_result_immediately !== false,
    show_correct_incorrect: settings.show_answers_after_submit !== false && settings.show_result_immediately !== false,
    show_correct_answer: settings.show_answers_after_submit !== false && settings.show_result_immediately !== false,
    access_mode: settings.access_mode === 'public' ? 'public' : 'private',
    duration_unlimited: durationMinutes >= UNLIMITED_DURATION_SENTINEL,
    duration_minutes: durationMinutes >= UNLIMITED_DURATION_SENTINEL ? '60' : String(durationMinutes),
    attempts_unlimited: maxAttempts <= UNLIMITED_ATTEMPTS_SENTINEL,
    max_attempts: maxAttempts <= UNLIMITED_ATTEMPTS_SENTINEL ? '1' : String(maxAttempts),
    full_page_mode: Boolean(settings.full_page_mode),
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
  };
}

/**
 * @param {typeof defaultTestSettingsPageForm} form
 * @param {{ passing_marks?: number, negative_marking?: number }} [rulesSnapshot]
 */
export function validateTestSettingsPageForm(form, rulesSnapshot = {}) {
  const errors = {};

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

  if (!form.duration_unlimited) {
    const duration = Number(form.duration_minutes);
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
      errors.duration_minutes = 'Duration must be between 1 and 600 minutes.';
    }
  }

  if (!form.attempts_unlimited) {
    const attempts = Number(form.max_attempts);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 50) {
      errors.max_attempts = 'Attempt limit must be between 1 and 50.';
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
      display_mode: form.display_mode,
      layout_mode: form.layout_mode,
      shuffle_questions: Boolean(form.shuffle_questions),
      shuffle_options: Boolean(form.shuffle_options),
      show_explanations: Boolean(form.show_explanations && form.show_score),
      show_result_immediately: showResults,
      show_answers_after_submit: showOutline,
      access_mode: form.access_mode,
      full_page_mode: Boolean(form.full_page_mode),
      score_bands: form.score_bands.map((band, index) => ({
        id: band.id,
        min_score: Number(band.min_score),
        max_score: Number(band.max_score),
        message_html: band.message_html,
        display_order: index,
      })),
    },
    rulesPayload: {
      duration_minutes: form.duration_unlimited
        ? UNLIMITED_DURATION_SENTINEL
        : Number(form.duration_minutes),
      max_attempts: form.attempts_unlimited ? UNLIMITED_ATTEMPTS_SENTINEL : Number(form.max_attempts),
      passing_marks: Number(rulesSnapshot.passing_marks ?? 0),
      negative_marking: Number(rulesSnapshot.negative_marking ?? 0),
    },
  };
}
