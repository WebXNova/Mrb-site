/**
 * Pass/fail derivation — use stored grade when present, else compare percentage to test threshold.
 * SQL fragment requires aliases: r (test_results), t (tests).
 */
export const DERIVED_PASS_STATUS_SQL = `
  CASE
    WHEN UPPER(TRIM(COALESCE(r.grade, ''))) = 'PASS' THEN 'PASS'
    WHEN UPPER(TRIM(COALESCE(r.grade, ''))) = 'FAIL' THEN 'FAIL'
    WHEN r.percentage >= COALESCE(t.passing_percentage, 0) THEN 'PASS'
    ELSE 'FAIL'
  END
`;

/**
 * @param {{ grade?: string|null, percentage?: number|null, passingPercentage?: number|null }} input
 * @returns {'PASS' | 'FAIL'}
 */
export function derivePassStatus({ grade, percentage, passingPercentage = 0 }) {
  const normalized = String(grade ?? '').trim().toUpperCase();
  if (normalized === 'PASS' || normalized === 'FAIL') return normalized;
  const pct = Number(percentage ?? 0);
  const threshold = Number(passingPercentage ?? 0);
  return pct >= threshold ? 'PASS' : 'FAIL';
}
