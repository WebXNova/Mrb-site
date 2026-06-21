-- =============================================================================
-- Integrity verification queries — orders.enrollment_id ↔ enrollments.id
-- Run after analysis and after migration.
-- =============================================================================

-- V1: Orphan orders (must be 0 before FK add)
SELECT o.id AS order_id, o.status, o.enrollment_id, o.user_id, o.course_id, o.amount, o.paid_at
FROM orders o
LEFT JOIN enrollments e ON e.id = o.enrollment_id
WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL
ORDER BY o.id;

-- V2: Orphan count summary
SELECT
  COUNT(*) AS orphan_count,
  SUM(o.status = 'paid') AS orphan_paid,
  SUM(o.status = 'pending') AS orphan_pending,
  SUM(o.status IN ('failed', 'cancelled', 'refunded')) AS orphan_other
FROM orders o
LEFT JOIN enrollments e ON e.id = o.enrollment_id
WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL;

-- V3: User/course consistency (must be 0)
SELECT o.id AS order_id, o.user_id AS order_user, e.user_id AS enr_user,
       o.course_id AS order_course, e.course_id AS enr_course, o.status
FROM orders o
INNER JOIN enrollments e ON e.id = o.enrollment_id
WHERE o.user_id <> e.user_id OR o.course_id <> e.course_id;

-- V4: FK exists
SELECT CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE
FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders'
  AND CONSTRAINT_NAME = 'fk_orders_enrollment';

-- V5: Referential coverage
SELECT
  COUNT(*) AS total_orders,
  SUM(enrollment_id IS NULL) AS null_enrollment_id,
  SUM(enrollment_id IS NOT NULL) AS with_enrollment_id,
  SUM(e.id IS NOT NULL) AS valid_enrollment_ref
FROM orders o
LEFT JOIN enrollments e ON e.id = o.enrollment_id;

-- V6: Enrollment delete impact (what SET NULL would touch)
SELECT e.id AS enrollment_id, e.status,
       COUNT(o.id) AS order_count,
       GROUP_CONCAT(o.id ORDER BY o.id) AS order_ids
FROM enrollments e
INNER JOIN orders o ON o.enrollment_id = e.id
GROUP BY e.id, e.status;

-- V7: Circular FK sanity (enrollments.order_id ↔ orders.id)
SELECT o.id AS order_id, o.enrollment_id, e.id AS enrollment_id_live, e.order_id AS enrollment_points_to
FROM orders o
INNER JOIN enrollments e ON e.id = o.enrollment_id
WHERE e.order_id IS NOT NULL AND e.order_id <> o.id;

-- V8: Post-migration — attempt to violate FK (should fail in test env only)
-- INSERT INTO orders (user_id, course_id, enrollment_id, amount, status)
-- VALUES (1, 1, 999999999, 100, 'pending');
