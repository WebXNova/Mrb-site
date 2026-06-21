-- Ensure legacy batch enrollment window columns accept wizard inserts when omitted.
-- Application always sets enrollment_open_at / enrollment_close_at on INSERT;
-- this migration backfills any NULL rows on older databases.

UPDATE course_batches
SET enrollment_open_at = COALESCE(enrollment_open_at, start_date, CURRENT_TIMESTAMP),
    enrollment_close_at = COALESCE(enrollment_close_at, end_date, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR))
WHERE enrollment_open_at IS NULL OR enrollment_close_at IS NULL;
