/**
 * Pass/fail derivation — use stored grade when present, else compare score to passing marks.
 * SQL fragment requires aliases: r (test_results), t (tests).
 */
export const DERIVED_PASS_STATUS_SQL = `
  CASE
    WHEN UPPER(TRIM(COALESCE(r.grade, ''))) = 'PASS' THEN 'PASS'
    WHEN UPPER(TRIM(COALESCE(r.grade, ''))) = 'FAIL' THEN 'FAIL'
    WHEN r.score >= COALESCE(t.passing_marks, 0) THEN 'PASS'
    ELSE 'FAIL'
  END
`;

/**
 * @param {{ grade?: string|null, score?: number|null, passingMarks?: number|null }} input
 * @returns {'PASS' | 'FAIL'}
 */
export function derivePassStatus({ grade, score, passingMarks = 0 }) {
  const normalized = String(grade ?? '').trim().toUpperCase();
  if (normalized === 'PASS' || normalized === 'FAIL') return normalized;
  const obtained = Number(score ?? 0);
  const threshold = Number(passingMarks ?? 0);
  return obtained >= threshold ? 'PASS' : 'FAIL';
}
