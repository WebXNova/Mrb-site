export const TEST_ACCESS_MODES = Object.freeze(['public', 'private']);

export const defaultTestSettingsForm = {
  shuffle_questions: false,
  shuffle_options: false,
  show_explanations: true,
  show_result_immediately: true,
  show_answers_after_submit: false,
  allow_retake: false,
  access_mode: 'private',
  start_date: '',
  end_date: '',
};

/**
 * @param {string|null|undefined} iso
 */
export function isoToDatetimeLocalValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * @param {string} localValue
 */
export function datetimeLocalToIso(localValue) {
  const trimmed = String(localValue ?? '').trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * @param {Record<string, unknown>} settings
 */
export function mapTestSettingsToForm(settings) {
  return {
    shuffle_questions: Boolean(settings.shuffle_questions),
    shuffle_options: Boolean(settings.shuffle_options),
    show_explanations: settings.show_explanations !== false,
    show_result_immediately: settings.show_result_immediately !== false,
    show_answers_after_submit: Boolean(settings.show_answers_after_submit),
    allow_retake: Boolean(settings.allow_retake),
    access_mode: settings.access_mode === 'public' ? 'public' : 'private',
    start_date: isoToDatetimeLocalValue(settings.start_date),
    end_date: isoToDatetimeLocalValue(settings.end_date),
  };
}

/**
 * @param {typeof defaultTestSettingsForm} form
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, errors: Record<string, string> }}
 */
export function validateTestSettingsForm(form) {
  const errors = {};

  if (!TEST_ACCESS_MODES.includes(form.access_mode)) {
    errors.access_mode = 'Access mode must be public or private.';
  }

  const startIso = datetimeLocalToIso(form.start_date);
  const endIso = datetimeLocalToIso(form.end_date);

  if (String(form.start_date ?? '').trim() && !startIso) {
    errors.start_date = 'Start date is invalid.';
  }

  if (String(form.end_date ?? '').trim() && !endIso) {
    errors.end_date = 'End date is invalid.';
  }

  if (startIso) {
    const startMs = new Date(startIso).getTime();
    if (startMs < Date.now() - 60_000) {
      errors.start_date = 'Start date must not be in the past.';
    }
  }

  if (startIso && endIso) {
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      errors.end_date = 'End date must be after start date.';
    }
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      shuffle_questions: Boolean(form.shuffle_questions),
      shuffle_options: Boolean(form.shuffle_options),
      show_explanations: Boolean(form.show_explanations),
      show_result_immediately: Boolean(form.show_result_immediately),
      show_answers_after_submit: Boolean(form.show_answers_after_submit),
      allow_retake: Boolean(form.allow_retake),
      access_mode: form.access_mode,
      start_date: startIso,
      end_date: endIso,
    },
  };
}
