/**
 * Shared test question limits — used by quiz draft and publish materialization.
 */

export const MAX_QUESTIONS_PER_TEST = 200;

export const parsePositiveTestId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: 'INVALID_TEST_ID' } };
  }
  return { ok: true, id };
};
