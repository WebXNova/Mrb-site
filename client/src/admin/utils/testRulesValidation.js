export const defaultTestRulesForm = {
  duration_minutes: '30',
  max_attempts: '1',
  passing_percentage: '40',
  passing_marks: '',
  negative_marking: '0',
};

/**
 * @param {typeof defaultTestRulesForm} form
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, errors: Record<string, string> }}
 */
export function validateTestRulesForm(form) {
  const errors = {};

  const durationMinutes = Number(form.duration_minutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    errors.duration_minutes = 'Duration must be between 1 and 600 minutes.';
  }

  const maxAttempts = Number(form.max_attempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 50) {
    errors.max_attempts = 'Max attempts must be between 1 and 50.';
  }

  const passingPercentageRaw = String(form.passing_percentage ?? '').trim();
  let passingPercentage;
  if (passingPercentageRaw !== '') {
    passingPercentage = Number(passingPercentageRaw);
    if (Number.isNaN(passingPercentage) || passingPercentage < 0 || passingPercentage > 100) {
      errors.passing_percentage = 'Passing percentage must be between 0 and 100.';
    }
  }

  const passingMarksRaw = String(form.passing_marks ?? '').trim();
  let passingMarks;
  if (passingMarksRaw !== '') {
    passingMarks = Number(passingMarksRaw);
    if (!Number.isFinite(passingMarks) || passingMarks < 0) {
      errors.passing_marks = 'Passing marks must be 0 or greater.';
    }
  }

  const negativeMarking = Number(form.negative_marking);
  if (!Number.isFinite(negativeMarking) || negativeMarking < 0 || negativeMarking > 1) {
    errors.negative_marking = 'Negative marking must be between 0 and 1.';
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  const payload = {
    duration_minutes: durationMinutes,
    max_attempts: maxAttempts,
    negative_marking: negativeMarking,
  };

  if (passingPercentageRaw !== '') {
    payload.passing_percentage = passingPercentage;
  }

  if (passingMarksRaw !== '') {
    payload.passing_marks = passingMarks;
  } else {
    payload.passing_marks = null;
  }

  return { ok: true, payload };
}

/**
 * @param {Record<string, unknown>} rules
 * @returns {typeof defaultTestRulesForm}
 */
export function mapTestRulesToForm(rules) {
  return {
    duration_minutes: String(rules.duration_minutes ?? 30),
    max_attempts: String(rules.max_attempts ?? 1),
    passing_percentage:
      rules.passing_percentage == null ? '' : String(rules.passing_percentage),
    passing_marks: rules.passing_marks == null ? '' : String(rules.passing_marks),
    negative_marking: String(rules.negative_marking ?? 0),
  };
}
