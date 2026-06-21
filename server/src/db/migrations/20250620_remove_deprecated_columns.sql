-- ============================================
-- REMOVE DEPRECATED ENROLLMENT COLUMNS
-- Migration: 20250620_remove_deprecated_columns
-- Runner: src/db/runRemoveDeprecatedEnrollmentColumns.js
--
-- Prerequisites:
--   1. 20250620_refactor_course_enrollment_schema applied
--   2. enrollment data backfill completed
--   3. 7-day validation period elapsed (or --force)
-- ============================================

-- Step 1: Drop batch enrollment window index (if present)
-- Handled idempotently by runRemoveDeprecatedEnrollmentColumns.js

-- Step 2: Drop deprecated columns on course_batches
--   enrollment_open_at, enrollment_close_at, allow_enrollment

-- Step 3: Drop legacy enrollment columns on courses (older databases only)
--   enrollment_open_at, enrollment_close_at, allow_enrollment
