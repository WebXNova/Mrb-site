/**
 * Optional data cleanup — normalize legacy question_bank.difficulty values.
 *
 * API validation now rejects writes outside easy|medium|hard. Existing rows with
 * arbitrary values remain readable but won't match list difficulty filters.
 *
 * Run manually after reviewing audit query below. Idempotent.
 */
UPDATE question_bank
SET difficulty = NULL
WHERE deleted_at IS NULL
  AND difficulty IS NOT NULL
  AND difficulty NOT IN ('easy', 'medium', 'hard');

-- Preflight (review before UPDATE):
-- SELECT difficulty, COUNT(*) AS row_count
-- FROM question_bank
-- WHERE deleted_at IS NULL
--   AND difficulty IS NOT NULL
--   AND difficulty NOT IN ('easy', 'medium', 'hard')
-- GROUP BY difficulty
-- ORDER BY row_count DESC;
