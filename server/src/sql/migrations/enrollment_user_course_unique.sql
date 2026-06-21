-- H-01: one enrollment per (user_id, course_id)
-- Run via: node scripts/run-enrollment-integrity-migration.mjs

UPDATE enrollments e_keep
INNER JOIN (
  SELECT user_id, course_id, MIN(id) AS keep_id
  FROM enrollments
  GROUP BY user_id, course_id
  HAVING COUNT(*) > 1
) g ON g.keep_id = e_keep.id
INNER JOIN enrollments e_dup
  ON e_dup.user_id = g.user_id AND e_dup.course_id = g.course_id AND e_dup.id <> g.keep_id
SET e_keep.order_id = e_dup.order_id
WHERE e_keep.order_id IS NULL AND e_dup.order_id IS NOT NULL;

UPDATE orders o
INNER JOIN enrollments e_dup ON e_dup.id = o.enrollment_id
INNER JOIN (
  SELECT user_id, course_id, MIN(id) AS keep_id
  FROM enrollments
  GROUP BY user_id, course_id
) g ON g.user_id = e_dup.user_id AND g.course_id = e_dup.course_id
SET o.enrollment_id = g.keep_id
WHERE o.enrollment_id <> g.keep_id;

DELETE e_dup FROM enrollments e_dup
INNER JOIN (
  SELECT user_id, course_id, MIN(id) AS keep_id
  FROM enrollments
  GROUP BY user_id, course_id
  HAVING COUNT(*) > 1
) d ON d.user_id = e_dup.user_id AND d.course_id = e_dup.course_id
WHERE e_dup.id <> d.keep_id;

ALTER TABLE enrollments
  ADD UNIQUE KEY uq_enrollments_user_course (user_id, course_id);
