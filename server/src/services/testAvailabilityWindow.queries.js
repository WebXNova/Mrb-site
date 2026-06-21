/**
 * SQL fragments — availability window enforced at INSERT (race-safe, UTC).
 */

/** Append to tests alias `t` WHERE clauses for new attempt creation. */
export const TEST_AVAILABILITY_CREATE_WHERE_SQL = `
  AND (t.start_date IS NULL OR t.start_date <= UTC_TIMESTAMP())
  AND (t.end_date IS NULL OR t.end_date >= UTC_TIMESTAMP())`;
