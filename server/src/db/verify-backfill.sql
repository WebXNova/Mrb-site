-- ============================================
-- VERIFY: Enrollment admission backfill
-- Runner: node src/db/runEnrollmentBackfill.js --verify
-- ============================================

-- 1) No NULL / invalid admission_status
SELECT
  'null_or_invalid_admission_status' AS check_name,
  COUNT(*) AS failing_rows
FROM courses
WHERE admission_status IS NULL
   OR admission_status NOT IN ('OPEN', 'CLOSED');

-- 2) Status distribution
SELECT
  admission_status,
  COUNT(*) AS course_count,
  MIN(start_date) AS earliest_start,
  MAX(end_date) AS latest_end,
  SUM(start_date IS NOT NULL) AS with_start_date,
  SUM(end_date IS NOT NULL) AS with_end_date
FROM courses
GROUP BY admission_status;

-- 3) OPEN courses that should be OPEN (within batch window)
SELECT
  'open_within_window' AS category,
  COUNT(DISTINCT c.id) AS course_count
FROM courses c
INNER JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
WHERE c.admission_status = 'OPEN'
  AND cb.allow_enrollment = 1
  AND cb.enrollment_open_at IS NOT NULL
  AND cb.enrollment_close_at IS NOT NULL
  AND cb.enrollment_open_at <= NOW()
  AND cb.enrollment_close_at >= NOW();

-- 4) OPEN courses without window restrictions
SELECT
  'open_unrestricted' AS category,
  COUNT(DISTINCT c.id) AS course_count
FROM courses c
LEFT JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
WHERE c.admission_status = 'OPEN'
  AND (
    cb.id IS NULL
    OR (
      cb.allow_enrollment = 1
      AND (cb.enrollment_open_at IS NULL OR cb.enrollment_close_at IS NULL)
    )
  );

-- 5) CLOSED courses outside window
SELECT
  'closed_outside_window' AS category,
  COUNT(DISTINCT c.id) AS course_count
FROM courses c
INNER JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
WHERE c.admission_status = 'CLOSED'
  AND cb.allow_enrollment = 1
  AND cb.enrollment_open_at IS NOT NULL
  AND cb.enrollment_close_at IS NOT NULL
  AND (NOW() < cb.enrollment_open_at OR NOW() > cb.enrollment_close_at);

-- 6) Dates should be populated when enrollment window exists
SELECT
  c.id,
  c.title,
  c.start_date,
  c.end_date,
  c.admission_status,
  cb.enrollment_open_at,
  cb.enrollment_close_at
FROM courses c
INNER JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
WHERE cb.enrollment_open_at IS NOT NULL
  AND cb.enrollment_close_at IS NOT NULL
  AND (c.start_date IS NULL OR c.end_date IS NULL)
LIMIT 20;

-- 7) Summary report
SELECT 'Total Courses' AS metric, COUNT(*) AS value FROM courses
UNION ALL
SELECT 'Open for Enrollment', COUNT(*) FROM courses WHERE admission_status = 'OPEN'
UNION ALL
SELECT 'Closed for Enrollment', COUNT(*) FROM courses WHERE admission_status = 'CLOSED'
UNION ALL
SELECT 'Courses with start_date', COUNT(*) FROM courses WHERE start_date IS NOT NULL
UNION ALL
SELECT 'Courses with end_date', COUNT(*) FROM courses WHERE end_date IS NOT NULL
UNION ALL
SELECT 'Courses with both dates', COUNT(*) FROM courses WHERE start_date IS NOT NULL AND end_date IS NOT NULL;
