-- Rollback fk_orders_enrollment (dev / emergency only).
-- Payment rows are unchanged; only the constraint is removed.

ALTER TABLE orders DROP FOREIGN KEY fk_orders_enrollment;
