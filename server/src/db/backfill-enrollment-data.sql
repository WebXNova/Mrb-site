-- ============================================
-- BACKFILL: Admission Status from Existing Data
-- Runner: node src/db/runEnrollmentBackfill.js
-- Verify: node src/db/runEnrollmentBackfill.js --verify
--
-- Canonical enrollment window columns live on course_batches.
-- Legacy courses.enrollment_* columns are handled by the Node runner when present.
-- ============================================

START TRANSACTION;

-- Step 1: Populate dates from enrollment window (preferred source)
UPDATE courses c
INNER JOIN (
  SELECT
    cb.course_id,
    cb.enrollment_open_at,
    cb.enrollment_close_at,
    cb.allow_enrollment
  FROM course_batches cb
  INNER JOIN (
    SELECT course_id, MAX(id) AS batch_id
    FROM course_batches
    WHERE is_active = 1
    GROUP BY course_id
  ) pick ON pick.batch_id = cb.id
) b ON b.course_id = c.id
SET
  c.start_date = COALESCE(c.start_date, DATE(b.enrollment_open_at)),
  c.end_date = COALESCE(c.end_date, DATE(b.enrollment_close_at));

-- Step 2: OPEN — within active enrollment window
UPDATE courses c
INNER JOIN (
  SELECT
    cb.course_id,
    cb.enrollment_open_at,
    cb.enrollment_close_at,
    cb.allow_enrollment
  FROM course_batches cb
  INNER JOIN (
    SELECT course_id, MAX(id) AS batch_id
    FROM course_batches
    WHERE is_active = 1
    GROUP BY course_id
  ) pick ON pick.batch_id = cb.id
) b ON b.course_id = c.id
SET c.admission_status = 'OPEN'
WHERE b.allow_enrollment = 1
  AND b.enrollment_open_at IS NOT NULL
  AND b.enrollment_close_at IS NOT NULL
  AND b.enrollment_open_at <= NOW()
  AND b.enrollment_close_at >= NOW();

-- Step 3: OPEN — no enrollment window restrictions (allowed, missing window bounds)
UPDATE courses c
INNER JOIN (
  SELECT
    cb.course_id,
    cb.enrollment_open_at,
    cb.enrollment_close_at,
    cb.allow_enrollment
  FROM course_batches cb
  INNER JOIN (
    SELECT course_id, MAX(id) AS batch_id
    FROM course_batches
    WHERE is_active = 1
    GROUP BY course_id
  ) pick ON pick.batch_id = cb.id
) b ON b.course_id = c.id
SET c.admission_status = 'OPEN'
WHERE b.allow_enrollment = 1
  AND (b.enrollment_open_at IS NULL OR b.enrollment_close_at IS NULL);

-- Step 4: OPEN — courses with no active batch (no window configured)
UPDATE courses c
LEFT JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
SET c.admission_status = 'OPEN'
WHERE cb.id IS NULL;

-- Step 5: CLOSED — all remaining courses
UPDATE courses
SET admission_status = 'CLOSED'
WHERE admission_status IS NULL
   OR admission_status <> 'OPEN';

COMMIT;
