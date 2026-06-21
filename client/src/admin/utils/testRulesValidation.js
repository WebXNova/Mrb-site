export const defaultTestRulesForm = {
  duration_minutes: '30',
  max_attempts: '1',
  passing_marks: '',
  negative_marking: '0',
};

/**
 * @param {typeof defaultTestRulesForm} form
 * @param {{ totalMarks?: number|null }} [context]
 * @returns {{ ok: true, payload: Record<string, unknown> } | { ok: false, errors: Record<string, string> }}
 */
export function validateTestRulesForm(form, context = {}) {
  const errors = {};

  const durationMinutes = Number(form.duration_minutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
    errors.duration_minutes = 'Duration must be between 1 and 600 minutes.';
  }

  const maxAttempts = Number(form.max_attempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 50) {
    errors.max_attempts = 'Max attempts must be between 1 and 50.';
  }

  const passingMarksRaw = String(form.passing_marks ?? '').trim();
  if (passingMarksRaw === '') {
    errors.passing_marks = 'Passing marks is required.';
  }

  let passingMarks;
  if (passingMarksRaw !== '') {
    passingMarks = Number(passingMarksRaw);
    if (!Number.isFinite(passingMarks) || passingMarks < 0) {
      errors.passing_marks = 'Passing marks must be 0 or greater.';
    } else if (Math.abs(passingMarks - Math.round(passingMarks * 100) / 100) > 1e-9) {
      errors.passing_marks = 'Passing marks must have at most 2 decimal places.';
    } else {
      const totalMarks = Number(context.totalMarks);
      if (Number.isFinite(totalMarks) && totalMarks > 0 && passingMarks > totalMarks) {
        errors.passing_marks = `Passing marks cannot exceed total marks (${totalMarks}).`;
      }
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
    passing_marks: passingMarks,
    negative_marking: negativeMarking,
  };

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
    passing_marks: rules.passing_marks == null ? '' : String(rules.passing_marks),
    negative_marking: String(rules.negative_marking ?? 0),
  };
}
