-- Order checkout integrity: cancellation audit + one-pending-order-per-enrollment guard.

-- Run via: node scripts/run-order-checkout-integrity-migration.mjs

--

-- Step order matters: audit columns must exist before dedupe UPDATE references them.



ALTER TABLE orders

  ADD COLUMN cancellation_reason VARCHAR(64) NULL AFTER status,

  ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancellation_reason;



-- Resolve duplicate pending orders (keep newest id per enrollment).

UPDATE orders o

INNER JOIN (

  SELECT enrollment_id, MAX(id) AS keep_id

  FROM orders

  WHERE status = 'pending' AND enrollment_id IS NOT NULL

  GROUP BY enrollment_id

  HAVING COUNT(*) > 1

) d ON d.enrollment_id = o.enrollment_id

SET o.status = 'cancelled',

    o.cancellation_reason = 'superseded',

    o.cancelled_at = COALESCE(o.cancelled_at, CURRENT_TIMESTAMP),

    o.updated_at = CURRENT_TIMESTAMP

WHERE o.status = 'pending'

  AND o.id <> d.keep_id;



ALTER TABLE orders

  ADD COLUMN pending_enrollment_id BIGINT UNSIGNED

    GENERATED ALWAYS AS (IF(status = 'pending', enrollment_id, NULL)) VIRTUAL

    AFTER cancelled_at;



ALTER TABLE orders

  ADD UNIQUE KEY uq_orders_one_pending_per_enrollment (pending_enrollment_id);



CREATE INDEX idx_orders_enrollment_status ON orders (enrollment_id, status);

