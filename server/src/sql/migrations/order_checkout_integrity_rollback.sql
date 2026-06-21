-- Rollback order checkout integrity migration (drops unique guard — use only in dev).

ALTER TABLE orders DROP INDEX uq_orders_one_pending_per_enrollment;
ALTER TABLE orders DROP COLUMN pending_enrollment_id;
ALTER TABLE orders DROP INDEX idx_orders_enrollment_status;
ALTER TABLE orders DROP COLUMN cancelled_at;
ALTER TABLE orders DROP COLUMN cancellation_reason;
