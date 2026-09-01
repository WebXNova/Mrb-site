/**
 * SQL fragments — availability window enforced at INSERT (race-safe, UTC).
 *
 * Active window: start_date <= now < end_date (now >= end_date is expired).
 */

/**
 * Append to tests alias `t` WHERE clauses for new attempt creation.
 * Course-linked tests (course_id > 0) skip start_date/end_date gates — those columns
 * are reserved for standalone tests only.
 */
export const TEST_AVAILABILITY_CREATE_WHERE_SQL = `
  AND (
    (t.course_id IS NOT NULL AND t.course_id > 0)
    OR (
      (t.start_date IS NULL OR t.start_date <= UTC_TIMESTAMP())
      AND (t.end_date IS NULL OR t.end_date > UTC_TIMESTAMP())
    )
  )`
