-- Phase 4: paid standalone tests (price, seats, orders, payments).
-- Companion to ensurePaidStandaloneSchema.js. Does not create course enrollments.

-- ALTER TABLE tests ADD COLUMN price_pkr INT NOT NULL DEFAULT 0 AFTER test_access_type;
-- ALTER TABLE tests ADD COLUMN seat_capacity INT NOT NULL DEFAULT 0 AFTER price_pkr;

-- ALTER TABLE test_results MODIFY COLUMN course_id BIGINT NULL;

-- Tables: standalone_test_registrations, standalone_test_orders, standalone_test_payments
-- (created by ensurePaidStandaloneSchema.js)
-- confirmed_seat_key is VIRTUAL so InnoDB can keep ON DELETE CASCADE on test_id/user_id.
