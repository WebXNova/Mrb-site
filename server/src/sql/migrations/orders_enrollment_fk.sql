-- =============================================================================
-- orders.enrollment_id → enrollments.id  (fk_orders_enrollment)
-- =============================================================================
-- DO NOT RUN until: node scripts/analyze-orders-enrollment-integrity.mjs exits 0
--
-- Recommended: ON DELETE SET NULL — preserves payment rows; unlinks enrollment.
-- Matches schema.sql and symmetric fk_enrollments_order (ON DELETE SET NULL).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 0 — Pre-flight integrity checks (read-only; run manually first)
-- -----------------------------------------------------------------------------
-- Orphan orders (invalid enrollment_id):
-- SELECT o.id, o.status, o.enrollment_id
-- FROM orders o
-- LEFT JOIN enrollments e ON e.id = o.enrollment_id
-- WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL;

-- User/course mismatch:
-- SELECT o.id, o.user_id, e.user_id, o.course_id, e.course_id
-- FROM orders o
-- INNER JOIN enrollments e ON e.id = o.enrollment_id
-- WHERE o.user_id <> e.user_id OR o.course_id <> e.course_id;

-- -----------------------------------------------------------------------------
-- STEP 1 — Remediate orphans (ONLY if pre-flight returns rows)
-- Paid/refunded: preserve row; null enrollment_id + audit reason.
-- Pending/failed/cancelled orphans: cancel + null link.
-- -----------------------------------------------------------------------------

-- Paid orphan example (adjust ids from analysis output):
-- UPDATE orders
-- SET enrollment_id = NULL,
--     cancellation_reason = COALESCE(cancellation_reason, 'orphan_enrollment_unlinked'),
--     updated_at = CURRENT_TIMESTAMP
-- WHERE id = ? AND status IN ('paid', 'refunded');

-- Non-terminal orphan pending:
-- UPDATE orders
-- SET status = 'cancelled',
--     cancellation_reason = 'orphan_enrollment_repair',
--     cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
--     enrollment_id = NULL,
--     updated_at = CURRENT_TIMESTAMP
-- WHERE id = ? AND status = 'pending';

-- -----------------------------------------------------------------------------
-- STEP 2 — Align enrollments.id type (live DB may be signed bigint; orders.enrollment_id is unsigned)
-- SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'id';

ALTER TABLE enrollments
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;

-- STEP 3 — Add foreign key (only when orphan count = 0)
-- -----------------------------------------------------------------------------

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_enrollment
  FOREIGN KEY (enrollment_id) REFERENCES enrollments (id)
  ON DELETE SET NULL
  ON UPDATE RESTRICT;
