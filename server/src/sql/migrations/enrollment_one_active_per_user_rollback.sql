ALTER TABLE enrollments DROP INDEX uq_enrollments_one_active_per_user;
ALTER TABLE enrollments DROP COLUMN active_user_id;
